import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/rateLimit";
import { adminDb } from "@/lib/supabase";
import { runDueSources } from "@/lib/intel/engine";

export const runtime = "nodejs";
export const maxDuration = 300;
/** Autonomous intel runs. Vercel Cron daily; any scheduler may call it more often (Bearer CRON_SECRET) and each source's refresh_schedule decides if it is due. */
export async function GET(req: Request) {
  const cs = process.env.CRON_SECRET;
  if (!cs || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cs}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ runs: await runDueSources(adminDb()) });
}
