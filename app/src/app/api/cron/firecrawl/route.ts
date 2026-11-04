import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/rateLimit";
import { adminDb } from "@/lib/supabase";
import { runDueSources } from "@/lib/intel/engine";
import { enrichDirectory } from "@/lib/intel/enrich";
import { firecrawlEnabled } from "@/lib/intel/firecrawl";
import { matchPublicOpportunities } from "@/lib/autoMatch";

export const runtime = "nodejs";
export const maxDuration = 300;
/** Daily Firecrawl ingest: public CivicPlus bid portals (parallel across hosts, crawl-delay within a host) + own-website directory enrichment. */
export async function GET(req: Request) {
  const cs = process.env.CRON_SECRET;
  if (!cs || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cs}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!firecrawlEnabled()) return NextResponse.json({ skipped: "FIRECRAWL_API_KEY missing" });
  const t0 = Date.now(); const db = adminDb(); const u = new URL(req.url);
  const step = u.searchParams.get("step");
  const runs = step === "enrich" ? [] : await runDueSources(db, { connector: "civicplus_bids", parallel: true, force: u.searchParams.get("force") === "1" });
  const enrich = step === "bids" ? null : await enrichDirectory(db, { max: Number(u.searchParams.get("enrich")) || 15, budgetMs: Math.max(0, 260_000 - (Date.now() - t0)) }).catch(e => ({ error: String(e).slice(0, 200) }));
  const match = await matchPublicOpportunities(db).catch(e => ({ error: String(e).slice(0, 200) }));
  return NextResponse.json({ runs, enrich, match });
}
