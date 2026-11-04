import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { currentUser, adminDb, audit } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
const Body = z.object({ request_type: z.enum(["export","delete","correct"]) });
/**
 * Only signed-in, verified email owners can request account data handling here.
 * Human verification/review precedes exporting, correction or deletion.
 * Homeowner requests use separate secure signed management tokens.
 */
export async function POST(req: Request) {
  if (!rateLimit(`privacy:${clientIp(req)}`, 4, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const u = await currentUser();
  if (!u?.user.email || !u.user.email_confirmed_at) return NextResponse.json({ error: "verified_sign_in_required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const db = adminDb();
  const digest = createHash("sha256").update(u.user.email.trim().toLowerCase()).digest("hex");
  const { data: existing } = await db.from("privacy_requests").select("id,status")
    .eq("email_hash", digest).eq("request_type", parsed.data.request_type)
    .in("status", ["open","verifying","in_progress"]).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, id: existing.id, status: existing.status });
  const { data: row, error } = await db.from("privacy_requests")
    .insert({ request_type: parsed.data.request_type, email_hash: digest, status: "open" })
    .select("id").single();
  if (error || !row) return NextResponse.json({ error: "request_failed" }, { status: 503 });
  await db.from("moderation_queue").insert({
    case_type: "privacy", priority: "P1", reason: "verified_account_data_request",
    details: { request_id: row.id, request_type: parsed.data.request_type, authenticated_user_id: u.user.id },
  });
  await audit(u.user.id,"privacy_request_created","privacy_request",row.id,{ request_type: parsed.data.request_type });
  return NextResponse.json({ ok: true, id: row.id, status: "open", message: "Your request is queued for verification and human review." }, { status: 201 });
}
