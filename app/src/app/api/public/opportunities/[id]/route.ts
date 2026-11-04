import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FIELDS = "id,kind,title,summary,trade,subtrades,property_type,city,state,zip,budget_min,budget_max,deadline,source_url,published_at,last_verified_at,expires_at,listing_type,tab,geographic_scope,official_apply_url,last_checked_at";

/** Only reads the rights-gated public view using an anonymous key. No private leads. */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`public-detail:${clientIp(req)}`, 80, 60_000))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const params = new URLSearchParams({ select: FIELDS, id: `eq.${id}`, limit: "1" });
  try {
    const response = await fetch(`${env.supabaseUrl()}/rest/v1/public_opportunities?${params}`, {
      headers: { apikey: env.supabaseAnon(), Authorization: `Bearer ${env.supabaseAnon()}` },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "listing_unavailable" }, { status: 503 });
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ opportunity: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "listing_unavailable" }, { status: 503 });
  }
}
