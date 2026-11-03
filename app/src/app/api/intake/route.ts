import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { IntakeForm } from "@/lib/schemas";
import { adminDb, audit } from "@/lib/supabase";
import { clientIp, rateLimit, safeEqual } from "@/lib/rateLimit";
import { env, missingEnv } from "@/lib/env";
import { preflight, withCors } from "@/lib/cors";
import { normalizeScope, verifyToken } from "@/lib/scope";
import { isDfwZip, lifecycleDates, newToken, CONSENT_TEXT } from "@/lib/homeowner";

export const runtime = "nodejs";

async function verifyTurnstile(token: string, ip: string) {
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({ secret: env.turnstileSecret(), response: token, remoteip: ip }),
  });
  return ((await r.json()) as { success: boolean }).success === true;
}

/**
 * Webflow "Post a Job" form target. Accepts JSON or form-encoded.
 * Auth: either header x-intake-secret (Webflow webhook / n8n relay) or a valid Turnstile token (browser fetch from embed).
 */
export async function POST(req: Request) { return withCors(req, await handle(req)); }

async function handle(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit(`intake:${ip}`, 5, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const ct = req.headers.get("content-type") ?? "";
  const raw = ct.includes("application/json") ? await req.json().catch(() => ({})) : Object.fromEntries(await req.formData());
  const parsed = IntakeForm.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) }, { status: 422 });
  const f = parsed.data;
  if (f.website) return NextResponse.json({ ok: true }); // honeypot: silently accept

  // Fail closed before storing customer PII if the verification/dispatch workflow is not configured.
  // Without WF-01, accepting intake would strand the lead and falsely promise an email.
  if (!process.env.N8N_WF01_WEBHOOK_URL || !process.env.N8N_WEBHOOK_SHARED_SECRET) {
    console.error("Crewforthat intake unavailable: verification workflow not configured");
    return NextResponse.json(
      { error: "verification_unavailable", message: "Project requests are temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const nc = missingEnv("INTAKE_SHARED_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"); if (nc) return nc;
  const secretOk = safeEqual(req.headers.get("x-intake-secret") ?? "", env.intakeSecret());
  if (!secretOk && !process.env.TURNSTILE_SECRET_KEY) return NextResponse.json({ error: "not_configured", missing: ["TURNSTILE_SECRET_KEY"] }, { status: 503 });
  if (!secretOk && !(await verifyTurnstile(f["cf-turnstile-response"], ip))) return NextResponse.json({ error: "captcha_failed" }, { status: 403 });

  const db = adminDb();
  const scope_hash = normalizeScope(`${f.zip} ${f.description}`);

  // Idempotent by submission_id
  const { data: existing } = await db.from("opportunities").select("id,status").eq("submission_id", f.submission_id).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, opportunity_id: existing.id, duplicate: true });

  const { data: pol } = await db.from("app_settings").select("value").eq("key", "archive_policy").maybeSingle();
  const urgency = f.urgency ?? "normal";
  const dates = lifecycleDates(urgency, new Date(), pol?.value ?? undefined);
  const inMarket = isDfwZip(f.zip);
  const { data: opp, error } = await db.from("opportunities").insert({
    listing_type: "direct_verified", urgency, geographic_scope: "zip", ...dates,
    kind: "private_lead", title: `Service request in ${f.city || f.zip}`, summary: null, trade: "other",
    property_type: f.property_type ?? null, city: f.city ?? null, zip: f.zip, submission_id: f.submission_id, scope_hash,
    status: "ingested", visibility: "internal", verification_status: "pending",
  }).select("id").single();
  if (error || !opp) {
    if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    await db.from("workflow_failures").insert({ workflow: "intake", node: "insert_opportunity", payload: { submission_id: f.submission_id }, error: error?.message });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const proofBase = { channel: "webflow_form", ip_hash: createHash("sha256").update(ip).digest("hex"), ua: req.headers.get("user-agent"), at: new Date().toISOString() };
  const { data: consent } = await db.from("consents").insert({
    opportunity_id: opp.id, purpose: "contact_share", sharing_scope: "up_to_5_matched_contractors",
    privacy_version: env.privacyVersion(),
    proof: { ...proofBase, consent_share: true, consent_privacy: true, consent_text: CONSENT_TEXT.contact_share, max_recipients: 5 },
  }).select("id").single();
  let publicConsentId: string | null = null;
  if (f.consent_public_listing === "true") {
    const { data: pc } = await db.from("consents").insert({ opportunity_id: opp.id, purpose: "public_listing", sharing_scope: "non_identifying_summary", privacy_version: env.privacyVersion(), proof: { ...proofBase, consent_text: CONSENT_TEXT.public_listing } }).select("id").single();
    publicConsentId = pc?.id ?? null;
  }
  await db.from("job_submissions").insert({ opportunity_id: opp.id, submitter_kind: f.submitter_kind ?? "homeowner", organization_name: f.organization_name ?? null, contact_share_consent_id: consent?.id, public_listing_consent_id: publicConsentId });
  const manage = newToken();
  await db.from("manage_tokens").insert({ opportunity_id: opp.id, token_hash: manage.hash, purpose: "manage", expires_at: new Date(Date.now() + 60 * 24 * 3600_000).toISOString() });
  if (!inMarket) await db.from("moderation_queue").insert({ opportunity_id: opp.id, reason: "out_of_market", details: { zip: f.zip, market: "DFW" } });
  await db.from("opportunities").update({ consent_id: consent?.id }).eq("id", opp.id);
  await db.from("lead_contacts").insert({ opportunity_id: opp.id, contact_name: f.name, email: f.email, phone: f.phone || null, address: f.address ?? null });

  // Similar-scope duplicates are flagged for a human, never auto-merged
  const { count } = await db.from("opportunities").select("id", { count: "exact", head: true }).eq("scope_hash", scope_hash).neq("id", opp.id);
  if (count) await db.from("moderation_queue").insert({ opportunity_id: opp.id, reason: "possible_duplicate", details: { scope_hash } });
  await audit("public", "intake_submitted", "opportunity", opp.id);

  // Hand off to n8n WF-01 (classification, email verification, review, matching)
  const hook = env.n8nIntakeWebhook();
  if (hook && inMarket) {
    await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json", "x-shared-secret": env.n8nSecret() },
      body: JSON.stringify({ opportunity_id: opp.id, text: `${f.description}\nTimeline: ${f.timeline ?? "not stated"}\nZIP: ${f.zip}`, email: f.email,
        verify_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/intake/verify?id=${opp.id}&t=${verifyToken(opp.id)}`,
        manage_url: `${process.env.NEXT_PUBLIC_APP_URL}/manage?t=${manage.token}`, in_market: inMarket, urgency }) })
      .catch(async (e) => { await db.from("workflow_failures").insert({ workflow: "WF-01", node: "handoff", payload: { opportunity_id: opp.id }, error: String(e), next_retry_at: new Date(Date.now() + 60_000).toISOString() }); });
  }
  return NextResponse.json({ ok: true, opportunity_id: opp.id, in_market: inMarket,
    next: inMarket ? "Check your email to verify your request. Your link to manage or withdraw it is in that email." : "Thanks! We currently match direct requests in the Dallas–Fort Worth area. We saved your request and will reach out if we can help." });
}

export async function OPTIONS(req: Request) { return preflight(req); }
