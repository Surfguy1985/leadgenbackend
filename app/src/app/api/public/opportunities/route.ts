import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { preflight, withCors } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
const TABS = ["jobs_now", "upcoming", "buyers"];
/** Public read for the Webflow tabs embed. Goes through the anon RLS view only (rights, hide_after, archive enforced in DB). */
export async function GET(req: Request) { return withCors(req, await handle(req)); }
export async function OPTIONS(req: Request) { return preflight(req); }
async function handle(req: Request) {
  if (!rateLimit(`pub:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const u = new URL(req.url); const tab = u.searchParams.get("tab") ?? "jobs_now"; const trade = u.searchParams.get("trade");
  if (!TABS.includes(tab)) return NextResponse.json({ error: "bad_tab" }, { status: 400 });
  const q = new URLSearchParams({ select: "id,listing_type,tab,title,summary,trade,city,zip,deadline,geographic_scope,official_apply_url,source_url,last_checked_at,published_at", tab: `eq.${tab}`, order: "published_at.desc.nullslast", limit: "50" });
  if (trade && /^[\w &-]{2,40}$/.test(trade)) q.set("trade", `ilike.*${trade}*`);
  const r = await fetch(`${env.supabaseUrl()}/rest/v1/public_opportunities?${q}`, { headers: { apikey: env.supabaseAnon(), Authorization: `Bearer ${env.supabaseAnon()}` }, next: { revalidate: 60 } });
  if (!r.ok) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  return NextResponse.json({ tab, items: await r.json() }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
