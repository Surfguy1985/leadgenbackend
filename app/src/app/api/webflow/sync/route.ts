import { NextResponse } from "next/server";
import { adminDb, audit } from "@/lib/supabase";
import { env, hasSharedSecret } from "@/lib/env";
import { safeEqual } from "@/lib/rateLimit";
import { oppFields, orgFields, isDirectoryPublic } from "@/lib/webflowMap";

export const runtime = "nodejs";
const WF = "https://api.webflow.com/v2";

type Sync = { created: number; updated: number; removed: number; errors: number };
async function upsertLive(coll: string, h: Record<string, string>, itemId: string | null, isLive: boolean, fieldData: object, s: Sync): Promise<{ ok: boolean; itemId: string | null; stop?: boolean }> {
  let res: Response | null = null;
  // STAGED items only (go live on the next site publish, which is a human decision). Never the /live endpoints.
  if (isLive && !itemId) { res = await fetch(`${WF}/collections/${coll}/items`, { method: "POST", headers: h, body: JSON.stringify({ isDraft: false, isArchived: false, fieldData }) }); if (res.ok) { itemId = ((await res.json()) as { id: string }).id; s.created++; } }
  else if (isLive && itemId) { res = await fetch(`${WF}/collections/${coll}/items/${itemId}`, { method: "PATCH", headers: h, body: JSON.stringify({ isDraft: false, isArchived: false, fieldData }) }); if (res.ok) s.updated++; }
  else if (!isLive && itemId) { await fetch(`${WF}/collections/${coll}/items/${itemId}/live`, { method: "DELETE", headers: h }); // unpublish if it was ever live
    res = await fetch(`${WF}/collections/${coll}/items/${itemId}`, { method: "DELETE", headers: h }); if (res.ok || res.status === 404) { s.removed++; itemId = null; } }
  if (res && !res.ok && res.status !== 404) { s.errors++; return { ok: false, itemId, stop: res.status === 429 }; }
  return { ok: true, itemId };
}

/** Mirrors ONLY rows the public may see into Webflow CMS (staged items; nothing is published): Opportunities (3 tabs) + Directory.
 *  Liveness for opportunities is decided by the anon RLS view itself (single source of truth for rights, hide_after, archive). */
export async function POST(req: Request) {
  if (!hasSharedSecret() || !safeEqual(req.headers.get("x-shared-secret") ?? "", env.sharedSecret())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = process.env.WEBFLOW_API_TOKEN, coll = process.env.WEBFLOW_OPPORTUNITIES_COLLECTION_ID, dirColl = process.env.WEBFLOW_DIRECTORY_COLLECTION_ID;
  if (!token || !coll) return NextResponse.json({ error: "not_configured", missing: [!token && "WEBFLOW_API_TOKEN", !coll && "WEBFLOW_OPPORTUNITIES_COLLECTION_ID"].filter(Boolean) }, { status: 503 });
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const db = adminDb();

  const { data: rows } = await db.from("opportunities")
    .select("id,kind,listing_type,title,summary,trade,city,zip,deadline,source_url,official_apply_url,published_at,last_verified_at,last_checked_at,geographic_scope,hide_after,webflow_item_id,updated_at,webflow_synced_at")
    .in("kind", ["public_bid", "discovery_signal"]).order("updated_at", { ascending: false }).limit(500);
  const now = new Date().toISOString();
  // changed rows, plus live rows whose hide_after has passed (time-based hide doesn't bump updated_at)
  const todo = (rows ?? []).filter(r => !r.webflow_synced_at || r.webflow_synced_at < r.updated_at || (r.webflow_item_id && r.hide_after && r.hide_after < now));
  const pubIds = new Set<string>();
  if (todo.length) {
    const r = await fetch(`${env.supabaseUrl()}/rest/v1/public_opportunities?select=id&id=in.(${todo.map(t => t.id).join(",")})`, { headers: { apikey: env.supabaseAnon(), Authorization: `Bearer ${env.supabaseAnon()}` } });
    if (!r.ok) return NextResponse.json({ error: "visibility_check_failed" }, { status: 502 });
    for (const x of (await r.json()) as { id: string }[]) pubIds.add(x.id);
  }
  const opp: Sync = { created: 0, updated: 0, removed: 0, errors: 0 };
  for (const o of todo) {
    try {
      const out = await upsertLive(coll, h, o.webflow_item_id, pubIds.has(o.id), oppFields(o), opp);
      if (out.stop) break; if (!out.ok) continue;
      await db.from("opportunities").update({ webflow_item_id: out.itemId, webflow_synced_at: new Date(Date.now() + 1000).toISOString() }).eq("id", o.id);
    } catch { opp.errors++; }
  }

  const dir: Sync = { created: 0, updated: 0, removed: 0, errors: 0 };
  if (dirColl) {
    const { data: orgs } = await db.from("organizations")
      .select("id,business_name,kind,city,zip,public_website,vendor_onboarding_url,claim_status,last_checked_at,slug,is_directory_listed,source_id,public_profile_optin,webflow_item_id,webflow_synced_at,updated_at,quality_score")
      .order("quality_score", { ascending: false, nullsFirst: false })
      .or("is_directory_listed.eq.true,webflow_item_id.not.is.null").limit(500);
    for (const o of (orgs ?? []).filter(r => !r.webflow_synced_at || r.webflow_synced_at < r.updated_at)) {
      try {
        const srcOk = o.source_id ? (await db.rpc("source_can", { p_source: o.source_id, p_action: "publish" })).data === true : false;
        const out = await upsertLive(dirColl, h, o.webflow_item_id, isDirectoryPublic(o, srcOk), orgFields(o), dir);
        if (out.stop) break; if (!out.ok) continue;
        await db.from("organizations").update({ webflow_item_id: out.itemId, webflow_synced_at: new Date(Date.now() + 1000).toISOString() }).eq("id", o.id);
      } catch { dir.errors++; }
    }
  }
  await audit("system", "webflow_sync", "opportunities", undefined, { opportunities: opp, directory: dirColl ? dir : "not_configured" });
  return NextResponse.json({ opportunities: opp, directory: dirColl ? dir : "not_configured", ...opp });
}
