import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, currentUser, audit } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
const Claim = z.object({
  organization_id: z.string().uuid(),
  note: z.string().trim().min(15).max(1200),
  website: z.string().url().max(300).optional().or(z.literal("")),
  agree_review: z.literal(true),
});

/**
 * Request an existing directory business profile claim. Never updates ownership,
 * contact details, vendor URLs, or claim status. Independent admin review required.
 */
export async function POST(req: Request) {
  if (!rateLimit(`claim:${clientIp(req)}`, 5, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const session = await currentUser();
  if (!session || !session.user.email_confirmed_at) return NextResponse.json({ error: "verified_sign_in_required" }, { status: 401 });
  const parsed = Claim.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map(x => x.message) }, { status: 422 });
  const f = parsed.data, db = adminDb();
  const { data: org } = await db.from("organizations").select("id,business_name,owner_user_id,claim_status,is_directory_listed")
    .eq("id", f.organization_id).maybeSingle();
  if (!org || !org.is_directory_listed) return NextResponse.json({ error: "organization_not_available" }, { status: 404 });
  if (org.owner_user_id) return NextResponse.json({ error: "organization_already_claimed" }, { status: 409 });
  const { data: prior } = await db.from("profile_claims").select("id,status")
    .eq("organization_id", org.id).eq("claimant_user_id", session.user.id).in("status", ["pending","challenge_sent","verified"]).maybeSingle();
  if (prior) return NextResponse.json({ ok: true, status: prior.status, id: prior.id });
  const { data: inserted, error } = await db.from("profile_claims").insert({
    organization_id: org.id, claimant_user_id: session.user.id,
    method: "document_review", status: "pending",
    evidence: { user_statement: f.note, website_submitted: f.website || null, at: new Date().toISOString(), privacy_notice: "Manual business ownership review; no ownership granted" },
  }).select("id").single();
  if (error || !inserted) return NextResponse.json({ error: "claim_failed" }, { status: 503 });
  await db.from("moderation_queue").insert({
    reason: "business_profile_claim", case_type: "claim", priority: "P1",
    details: { claim_id: inserted.id, organization_id: org.id },
  });
  await audit(session.user.id, "profile_claim_requested", "organization", org.id, { claim_id: inserted.id });
  return NextResponse.json({ ok: true, status: "pending_review", id: inserted.id }, { status: 201 });
}
