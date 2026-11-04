import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/rateLimit";
import { adminDb } from "@/lib/supabase";
import { runDueSources } from "@/lib/intel/engine";
import { matchPublicOpportunities } from "@/lib/autoMatch";
import { enrichDirectory } from "@/lib/intel/enrich";

export const runtime = "nodejs";
export const maxDuration = 300;
/** Autonomous intel runs. Vercel Cron daily; any scheduler may call it more often (Bearer CRON_SECRET) and each source's refresh_schedule decides if it is due. */
export async function GET(req: Request) {
  const cs = process.env.CRON_SECRET;
  if (!cs || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cs}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t0 = Date.now(); const db = adminDb();
  const runs = await runDueSources(db, { limit: Math.min(2000, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 2000)) });
  const match = await matchPublicOpportunities(db).catch(e => ({ error: String(e).slice(0, 200) })); // new intel opps -> contractor feeds (notifications suppressed)
  const enrich = await enrichDirectory(db, { max: Number(new URL(req.url).searchParams.get("enrich")) || 15, budgetMs: Math.max(0, 270_000 - (Date.now() - t0)) }).catch(e => ({ error: String(e).slice(0, 200) })); // Firecrawl: own-website contact fill for TDLR review records
  return NextResponse.json({ runs, match, enrich });
}
