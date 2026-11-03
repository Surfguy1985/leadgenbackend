import { NextResponse } from "next/server";
import { adminDb, audit } from "@/lib/supabase";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/rateLimit";

export const runtime = "nodejs";
const WF = "https://api.webflow.com/v2";
const LIVE = ["published","matched","notified","responded"];
const LABEL: Record<string, string> = { public_bid: "Public bid (not exclusive)", discovery_signal: "Discovery signal (unverified)" };

/** Mirrors ONLY approved public opportunities into the Webflow "Opportunities" CMS collection (Data API v2, live items).
 *  Never sends private leads, contacts, or test data. Trigger: n8n schedule (every 15 min) or after admin approval. */
export async function POST(req: Request) {
  if (!process.env.N8N_WEBHOOK_SHARED_SECRET || !safeEqual(req.headers.get("x-shared-secret") ?? "", env.n8nSecret())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = process.env.WEBFLOW_API_TOKEN, coll = process.env.WEBFLOW_OPPORTUNITIES_COLLECTION_ID;
  if (!token || !coll) return NextResponse.json({ error: "not_configured", missing: ["WEBFLOW_API_TOKEN","WEBFLOW_OPPORTUNITIES_COLLECTION_ID"] }, { status: 503 });
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const db = adminDb();

  const { data: rows } = await db.from("opportunities")
    .select("id,kind,title,summary,trade,city,zip,deadline,source_url,published_at,last_verified_at,status,visibility,is_test_data,webflow_item_id,updated_at,webflow_synced_at")
    .in("kind", ["public_bid","discovery_signal"]).order("updated_at", { ascending: false }).limit(500);
  // PostgREST can't compare two columns, so changed rows are filtered here:
  const todo = (rows ?? []).filter(r => !r.webflow_synced_at || r.webflow_synced_at < r.updated_at);
  let created = 0, updated = 0, removed = 0, errors = 0;

  for (const o of todo) {
    const isLive = o.visibility === "public" && LIVE.includes(o.status) && !o.is_test_data;
    const fieldData = {
      name: o.title.slice(0, 256), slug: `${o.trade}-${o.id.slice(0, 8)}`, "opportunity-id": o.id, summary: o.summary ?? "",
      "kind-label": LABEL[o.kind] ?? o.kind, trade: o.trade, city: o.city ?? "", zip: o.zip ?? "",
      deadline: o.deadline, "source-url": o.source_url ?? "", "published-date": o.published_at, "last-verified": o.last_verified_at,
    };
    try {
      let res: Response | null = null; let itemId = o.webflow_item_id;
      if (isLive && !itemId) { res = await fetch(`${WF}/collections/${coll}/items/live`, { method: "POST", headers: h, body: JSON.stringify({ isDraft: false, isArchived: false, fieldData }) }); if (res.ok) { itemId = ((await res.json()) as { id: string }).id; created++; } }
      else if (isLive && itemId) { res = await fetch(`${WF}/collections/${coll}/items/${itemId}/live`, { method: "PATCH", headers: h, body: JSON.stringify({ isDraft: false, isArchived: false, fieldData }) }); if (res.ok) updated++; }
      else if (!isLive && itemId) { res = await fetch(`${WF}/collections/${coll}/items/${itemId}/live`, { method: "DELETE", headers: h }); if (res.ok || res.status === 404) { removed++; itemId = null; } } // unpublish
      if (res && !res.ok && res.status !== 404) { errors++; if (res.status === 429) break; continue; }
      await db.from("opportunities").update({ webflow_item_id: itemId, webflow_synced_at: new Date(Date.now() + 1000).toISOString() }).eq("id", o.id);
    } catch { errors++; }
  }
  await audit("system", "webflow_sync", "opportunities", undefined, { created, updated, removed, errors });
  return NextResponse.json({ created, updated, removed, errors });
}
