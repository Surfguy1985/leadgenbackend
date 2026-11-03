import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/rateLimit";
import { runSamGov } from "@/lib/connectors/samgov";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Vercel Cron (daily): SAM.gov live ingest (TX, last 3 days) then Webflow CMS staged sync. Auth: Vercel sends Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const cs = process.env.CRON_SECRET;
  if (!cs || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cs}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {};
  try { out.samgov = process.env.SAM_GOV_API_KEY ? await runSamGov({ dryRun: false, days: 3, maxPages: 3 }) : "not_configured"; }
  catch (e) { out.samgov = { error: String(e).slice(0, 200) }; }
  try {
    const r = await fetch(new URL("/api/webflow/sync", req.url), { method: "POST", headers: { "x-shared-secret": env.n8nSecret() } });
    out.webflow = { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch (e) { out.webflow = { error: String(e).slice(0, 200) }; }
  return NextResponse.json(out);
}
