import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase";
import { env } from "@/lib/env";
import { PAGE_SIZE, cors, CACHE, cleanQ, pageNum } from "@/lib/publicFeed";
import { isDirectoryPublic } from "@/lib/webflowMap";

export const runtime = "nodejs";
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req) }); }
/** GET /api/public/directory?q=&city=&page= — directory-listed orgs whose source allows publishing (or owner opt-in). Business fields only. */
export async function GET(req: Request) {
  const u = new URL(req.url); const page = pageNum(u.searchParams.get("page")); const q = cleanQ(u.searchParams.get("q")).toLowerCase(); const city = cleanQ(u.searchParams.get("city")).toLowerCase();
  const db = adminDb();
  const { data, error } = await db.from("organizations").select("id,business_name,kind,city,zip,public_website,vendor_onboarding_url,claim_status,last_checked_at,slug,is_directory_listed,source_id,public_profile_optin,quality_score")
    .eq("is_directory_listed", true).order("quality_score", { ascending: false, nullsFirst: false }).limit(2000);
  if (error) return NextResponse.json({ error: "upstream" }, { status: 502, headers: cors(req) });
  const srcOk = new Map<string, boolean>();
  for (const s of new Set((data ?? []).map(o => o.source_id).filter(Boolean) as string[])) srcOk.set(s, (await db.rpc("source_can", { p_source: s, p_action: "publish" })).data === true);
  const app = env.appUrl();
  const all = (data ?? []).filter(o => isDirectoryPublic(o, o.source_id ? !!srcOk.get(o.source_id) : false))
    .filter(o => (!q || `${o.business_name} ${o.city ?? ""} ${o.kind}`.toLowerCase().includes(q)) && (!city || (o.city ?? "").toLowerCase().includes(city)));
  const items = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(o => ({ id: o.id, name: o.business_name, kind: o.kind, city: o.city, website: o.public_website, vendor_onboarding_url: o.vendor_onboarding_url,
    claim_status: o.claim_status, checked: o.last_checked_at, quality_score: o.quality_score ?? 0, claim_url: o.claim_status === "claimed" ? null : `${app}/claim/${o.id}?utm_source=webflow&utm_medium=directory` }));
  return NextResponse.json({ page, page_size: PAGE_SIZE, total: all.length, pages: Math.ceil(all.length / PAGE_SIZE), items }, { headers: { ...cors(req), ...CACHE } });
}
