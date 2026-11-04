import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/rateLimit";
import { runSamGov } from "@/lib/connectors/samgov";
import { env } from "@/lib/env";
import { adminDb } from "@/lib/supabase";
import { postDailyDigest } from "@/lib/facebook";
import { retrySweep, runFreshness } from "@/lib/workflows";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Vercel Cron (daily): SAM.gov ingest (WF-02), freshness/expiry (WF-06), failed-step retry sweep (WF-09), Webflow CMS sync, then the Facebook Page digest. Auth: Vercel sends Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const cs = process.env.CRON_SECRET;
  if (!cs || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cs}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {};
  try { out.samgov = process.env.SAM_GOV_API_KEY ? await runSamGov({ dryRun: false, days: 3, maxPages: 3 }) : "not_configured"; }
  catch (e) { out.samgov = { error: String(e).slice(0, 200) }; }
  try { out.freshness = await runFreshness(); } catch (e) { out.freshness = { error: String(e).slice(0, 200) }; }
  try { out.retries = await retrySweep(); } catch (e) { out.retries = { error: String(e).slice(0, 200) }; }
  try {
    const r = await fetch(new URL("/api/webflow/sync", req.url), { method: "POST", headers: { "x-shared-secret": env.sharedSecret() } });
    out.webflow = { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch (e) { out.webflow = { error: String(e).slice(0, 200) }; }
  // FB digest after ingest + Webflow sync so links resolve; ?fb_dry_run=1 previews without posting.
  try { out.facebook = await postDailyDigest(adminDb(), { dryRun: new URL(req.url).searchParams.get("fb_dry_run") === "1" }); } catch (e) { out.facebook = { error: String(e).slice(0, 200) }; }
  return NextResponse.json(out);
}
