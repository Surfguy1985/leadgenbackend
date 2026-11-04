import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { TAB_MAP, PAGE_SIZE, cors, CACHE, cleanQ, cleanTrade, pageNum, OPP_FIELDS } from "@/lib/publicFeed";
import { tradeLabel, OPP_LABEL } from "@/lib/webflowMap";

export const runtime = "nodejs";
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req) }); }
/** GET /api/public/listings?tab=jobs_now|upcoming|buyers&trade=&city=&q=&page= — reads the anon RLS view (public_opportunities) with the anon key. */
export async function GET(req: Request) {
  const u = new URL(req.url); const tab = TAB_MAP[u.searchParams.get("tab") ?? "jobs_now"];
  if (!tab) return NextResponse.json({ error: "bad_tab" }, { status: 400, headers: cors(req) });
  const page = pageNum(u.searchParams.get("page")); const size = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || PAGE_SIZE));
  const p = new URLSearchParams({ select: OPP_FIELDS, tab: `eq.${tab}`, order: "quality_score.desc.nullslast,published_at.desc.nullslast,id.asc" });
  const trade = cleanTrade(u.searchParams.get("trade")); if (trade) p.set("trade", `eq.${trade}`);
  const city = cleanQ(u.searchParams.get("city")); if (city) p.set("city", `ilike.*${city}*`);
  const q = cleanQ(u.searchParams.get("q")); if (q) p.set("or", `(title.ilike.*${q}*,summary.ilike.*${q}*,city.ilike.*${q}*)`);
  const from = (page - 1) * size;
  const r = await fetch(`${env.supabaseUrl()}/rest/v1/public_opportunities?${p}`, { headers: { apikey: env.supabaseAnon(), Authorization: `Bearer ${env.supabaseAnon()}`, Range: `${from}-${from + size - 1}`, Prefer: "count=exact" }, cache: "no-store" });
  if (!r.ok && r.status !== 416) return NextResponse.json({ error: "upstream" }, { status: 502, headers: cors(req) });
  const rows: any[] = r.status === 416 ? [] : await r.json(); const total = Number((r.headers.get("content-range") ?? "").split("/")[1]) || 0;
  const app = env.appUrl();
  const items = rows.map(o => ({
    id: o.id, tab: o.tab, listing_type: o.listing_type, kind_label: o.listing_type === "upcoming_forecast" ? "Future contract (forecast)" : o.listing_type === "buyer_prospect" ? "Possible buyer (not a job post)" : OPP_LABEL[o.kind] ?? o.kind,
    title: o.title, summary: o.summary ?? "", trade: o.trade, trade_label: tradeLabel(o.trade), city: o.city, state: o.state, zip: o.geographic_scope === "zip" ? o.zip : null,
    deadline: o.deadline, checked: o.last_checked_at ?? o.last_verified_at, source_url: o.source_url, apply_url: o.official_apply_url ?? (o.kind === "public_bid" ? o.source_url : null),
    quality_score: o.quality_score ?? 0, alerts_url: `${app}/login?next=${encodeURIComponent(`/contractor?opp=${o.id}`)}`,
  }));
  return NextResponse.json({ tab, page, page_size: size, total, pages: Math.ceil(total / size), items }, { headers: { ...cors(req), ...CACHE } });
}
