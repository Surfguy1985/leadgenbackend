import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/rateLimit";
import { adminDb } from "@/lib/supabase";
import { verifyBacklog } from "@/lib/intel/verify";

export const runtime = "nodejs";
export const maxDuration = 300;
/** Franchise-tax verification backlog (chunked: ~300 records / run within 270s). */
export async function GET(req: Request) {
  const cs = process.env.CRON_SECRET;
  if (!cs || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cs}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const max = Math.min(300, Number(new URL(req.url).searchParams.get("max")) || 300);
  return NextResponse.json(await verifyBacklog(adminDb(), { max }));
}
