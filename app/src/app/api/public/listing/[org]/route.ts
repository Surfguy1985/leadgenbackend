import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { listingStats, track, viewerHash } from "@/lib/monetization";

export const runtime = "nodejs";
const UUID = /^[0-9a-f-]{36}$/i;
const cors = { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" };
async function load(id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await adminDb().from("organizations").select("id,business_name,city,primary_trade,claim_status,is_directory_listed").eq("id", id).maybeSingle();
  return data?.is_directory_listed ? data : null;
}
/** Real teaser numbers for a Directory listing (no PII, no lead details). */
export async function GET(_: Request, ctx: { params: Promise<{ org: string }> }) {
  const o = await load((await ctx.params).org); if (!o) return NextResponse.json({ error: "not_found" }, { status: 404, headers: cors });
  const s = await listingStats(adminDb(), { id: o.id, city: o.city, trade: o.primary_trade });
  return NextResponse.json({ id: o.id, name: o.business_name, claimed: o.claim_status === "claimed", ...s }, { headers: cors });
}
/** Record one real view per hashed visitor per day. Bots are skipped. */
export async function POST(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const ua = req.headers.get("user-agent") ?? "";
  if (/bot|crawl|spider|preview|curl|wget/i.test(ua) || !ua) return NextResponse.json({ ok: true, counted: false }, { headers: cors });
  const ip = clientIp(req); if (!rateLimit(`lv:${ip}`, 60, 60_000)) return NextResponse.json({ ok: false }, { status: 429, headers: cors });
  const o = await load((await ctx.params).org); if (!o) return NextResponse.json({ error: "not_found" }, { status: 404, headers: cors });
  const day = new Date().toISOString().slice(0, 10); const db = adminDb();
  const { error } = await db.from("listing_views").insert({ organization_id: o.id, day, viewer_hash: viewerHash(ip, ua, day, process.env.SHARED_SECRET ?? "cf") });
  if (!error) await track(db, "view", { id: o.id, city: (o.city ?? "").toLowerCase(), trade: o.primary_trade });
  return NextResponse.json({ ok: true, counted: !error }, { headers: cors });
}
export function OPTIONS() { return new Response(null, { headers: { ...cors, "access-control-allow-methods": "GET,POST", "access-control-allow-headers": "content-type" } }); }
