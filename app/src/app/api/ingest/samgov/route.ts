import { NextResponse } from "next/server";
import { env, hasSharedSecret } from "@/lib/env";
import { safeEqual } from "@/lib/rateLimit";
import { runSamGov } from "@/lib/connectors/samgov";
import { FetchDenied } from "@/lib/fetcher";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Cron/manual trigger. Default is dry-run; pass {"dryRun":false} to write. Shared-secret protected. */
export async function POST(req: Request) {
  if (!hasSharedSecret() || !safeEqual(req.headers.get("x-shared-secret") ?? "", env.sharedSecret())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SAM_GOV_API_KEY) return NextResponse.json({ error: "not_configured", missing: ["SAM_GOV_API_KEY"] }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { dryRun?: boolean; days?: number; maxPages?: number };
  try { return NextResponse.json(await runSamGov({ dryRun: b.dryRun !== false, days: Math.min(Math.max(b.days ?? 3, 1), 30), maxPages: Math.min(Math.max(b.maxPages ?? 2, 1), 5) })); }
  catch (e) { return NextResponse.json({ error: e instanceof FetchDenied ? e.reason : "failed" }, { status: e instanceof FetchDenied ? 403 : 500 }); }
}
