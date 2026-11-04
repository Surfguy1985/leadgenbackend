import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, currentUser, audit } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { emailOnDomain, newChallenge, siteDomain, CLAIM_MAX_SENDS_PER_DAY } from "@/lib/claims";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
const Claim = z.object({
  organization_id: z.string().uuid(),
  method: z.enum(["domain_email", "document_review"]).default("document_review"),
  claim_email: z.string().email().max(200).optional(),
  note: z.string().trim().max(1200).optional().default(""),
  website: z.string().url().max(300).optional().or(z.literal("")),
  agree_review: z.literal(true),
});

/**
 * Start a business-profile claim (spec RT-05).
 *  - domain_email: 6-digit code to an address on the business's own website domain (15 min, 5 attempts, 3 sends/day).
 *  - document_review: statement (+ optional proof upload) for a human reviewer in /admin.
 *  - Already-claimed orgs: the request is filed as a dispute for review; nothing changes until an admin decides.
 * Never changes ownership here.
 */
export async function POST(req: Request) {
  if (!rateLimit(`claim:${clientIp(req)}`, 5, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const session = await currentUser();
  if (!session || !session.user.email_confirmed_at) return NextResponse.json({ error: "verified_sign_in_required" }, { status: 401 });
  const parsed = Claim.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map(x => x.message) }, { status: 422 });
  const f = parsed.data, db = adminDb(), uid = session.user.id;
  const { data: org } = await db.from("organizations").select("id,business_name,owner_user_id,claim_status,is_directory_listed,public_website,website")
    .eq("id", f.organization_id).maybeSingle();
  if (!org || !org.is_directory_listed) return NextResponse.json({ error: "organization_not_available" }, { status: 404 });
  if (org.owner_user_id === uid) return NextResponse.json({ ok: true, status: "approved", next: "/onboarding" });
  const dispute = !!org.owner_user_id;
  if ((dispute || f.method === "document_review") && f.note.length < 15) return NextResponse.json({ error: "statement_required" }, { status: 422 });

  const { data: prior } = await db.from("profile_claims").select("id,status,method").eq("organization_id", org.id).eq("claimant_user_id", uid)
    .in("status", ["pending", "challenge_sent", "verified", "disputed"]).maybeSingle();
  if (prior && !(prior.status === "challenge_sent" && f.method === "domain_email")) return NextResponse.json({ ok: true, status: prior.status, id: prior.id });

  if (!dispute && f.method === "domain_email") {
    const site = org.public_website || org.website;
    if (!f.claim_email || !emailOnDomain(f.claim_email, site)) return NextResponse.json({ error: "email_not_on_business_domain", domain: siteDomain(site) }, { status: 422 });
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from("audit_logs").select("id", { count: "exact", head: true }).eq("actor", uid).eq("action", "profile_claim_code_sent").gte("timestamp", since);
    if ((count ?? 0) >= CLAIM_MAX_SENDS_PER_DAY) return NextResponse.json({ error: "too_many_codes_today" }, { status: 429 });
    let id = prior?.id;
    if (!id) {
      const ins = await db.from("profile_claims").insert({ organization_id: org.id, claimant_user_id: uid, method: "domain_email", status: "pending", claim_email: f.claim_email.toLowerCase(), evidence: { at: new Date().toISOString() } }).select("id").single();
      if (ins.error || !ins.data) return NextResponse.json({ error: "claim_failed" }, { status: 503 });
      id = ins.data.id;
    }
    const ch = newChallenge(id!);
    await db.from("profile_claims").update({ status: "challenge_sent", claim_email: f.claim_email.toLowerCase(), challenge_hash: ch.hash, challenge_expires_at: ch.expiresAt, attempts: 0 }).eq("id", id!);
    const r = await sendEmail({ to: f.claim_email, idempotencyKey: `claim-${id}-${ch.hash.slice(0, 8)}`, subject: `Your Crewforthat verification code: ${ch.code}`,
      html: `<p>Someone signed in to Crewforthat as ${session.user.email} asked to claim <b>${escapeHtml(org.business_name)}</b>.</p><p>Your code is <b style="font-size:20px">${ch.code}</b>. It expires in 15 minutes.</p><p>If this wasn't you or a colleague, ignore this email; nothing changes without the code.</p>` });
    await audit(uid, "profile_claim_code_sent", "organization", org.id, { claim_id: id, sent: r.sent, domain: siteDomain(org.public_website || org.website) });
    if (!r.sent) return NextResponse.json({ error: "email_unavailable", hint: "Use document review instead.", id }, { status: 503 });
    return NextResponse.json({ ok: true, status: "challenge_sent", id }, { status: 201 });
  }

  const { data: inserted, error } = await db.from("profile_claims").insert({
    organization_id: org.id, claimant_user_id: uid, method: "document_review", status: dispute ? "disputed" : "pending",
    evidence: { user_statement: f.note, website_submitted: f.website || null, at: new Date().toISOString(), dispute },
  }).select("id").single();
  if (error || !inserted) return NextResponse.json({ error: "claim_failed" }, { status: 503 });
  await db.from("moderation_queue").insert({ reason: dispute ? "business_profile_dispute" : "business_profile_claim", case_type: "claim", priority: "P1", details: { claim_id: inserted.id, organization_id: org.id, dispute } });
  await audit(uid, dispute ? "profile_claim_disputed" : "profile_claim_requested", "organization", org.id, { claim_id: inserted.id });
  return NextResponse.json({ ok: true, status: dispute ? "dispute_filed" : "pending_review", id: inserted.id }, { status: 201 });
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
