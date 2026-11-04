import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/rateLimit";
import { adminDb } from "@/lib/supabase";
import { runDueSources } from "@/lib/intel/engine";
import { matchPublicOpportunities } from "@/lib/autoMatch";

export const runtime = "nodejs";
export const maxDuration = 300;
/** USAspending runs alone (its API is slow; connector budget 240s). */
export async function GET(req: Request) {
  const cs = process.env.CRON_SECRET;
  if (!cs || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${cs}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = adminDb(); const runs = await runDueSources(db, { connector: "usaspending", force: new URL(req.url).searchParams.get("force") === "1" });
  const match = await matchPublicOpportunities(db).catch(e => ({ error: String(e).slice(0, 200) }));
  return NextResponse.json({ runs, match });
}
