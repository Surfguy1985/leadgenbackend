import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
const Report = z.object({
  opportunity_id: z.string().uuid(),
  issue: z.enum(["broken_link","expired","wrong_category","duplicate","incorrect_details","rights_concern"]),
  detail: z.string().trim().max(500).optional(),
  website: z.string().max(0).optional(),
});
/** Anyone can flag a verified public notice. Does not publish or expose contact records. */
export async function POST(req: Request) {
  if (!rateLimit(`report:${clientIp(req)}`, 5, 60_000))
    return NextResponse.json({ error: "rate_limited", message: "Too many reports. Please try later." }, { status: 429 });
  const parsed = Report.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const x = parsed.data;
  if (x.website) return NextResponse.json({ ok: true });
  const db = adminDb();
  const { data: publicListing } = await db.from("public_opportunities").select("id").eq("id", x.opportunity_id).maybeSingle();
  if (!publicListing) return NextResponse.json({ error: "listing_unavailable" }, { status: 404 });
  const { error } = await db.from("moderation_queue").insert({
    opportunity_id: x.opportunity_id,
    reason: x.issue,
    case_type: "report_listing",
    priority: x.issue === "rights_concern" ? "P1" : "P2",
    details: { detail: x.detail ?? "", reporter: "anonymous", channel: "public_report" },
  });
  if (error) return NextResponse.json({ error: "queue_failed" }, { status: 503 });
  return NextResponse.json({ ok: true, message: "Thanks. Your report was sent for review." }, { status: 201 });
}
