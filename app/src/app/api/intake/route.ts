import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { IntakeForm } from "@/lib/schemas";
import { adminDb, audit } from "@/lib/supabase";
import { clientIp, rateLimit, safeEqual } from "@/lib/rateLimit";
import { env, missingEnv } from "@/lib/env";
import { preflight, withCors } from "@/lib/cors";
import { normalizeScope, verifyToken } from "@/lib/scope";

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

  const nc = missingEnv("INTAKE_SHARED_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"); if (nc) return nc;
  const secretOk = safeEqual(req.headers.get("x-intake-secret") ?? "", env.intakeSecret());
  if (!secretOk && !process.env.TURNSTILE_SECRET_KEY) return NextResponse.json({ error: "not_configured", missing: ["TURNSTILE_SECRET_KEY"] }, { status: 503 });
  if (!secretOk && !(await verifyTurnstile(f["cf-turnstile-response"], ip))) return NextResponse.json({ error: "captcha_failed" }, { status: 403 });

  const db = adminDb();
  const scope_hash = normalizeScope(`${f.zip} ${f.description}`);

  // Idempotent by submission_id
  const { data: existing } = await db.from("opportunities").select("id,status").eq("submission_id", f.submission_id).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, opportunity_id: existing.id, duplicate: true });

  const { data: opp, error } = await db.from("opportunities").insert({
    kind: "private_lead", title: `Service request in ${f.city || f.zip}`, summary: null, trade: "other",
    property_type: f.property_type ?? null, city: f.city ?? null, zip: f.zip, submission_id: f.submission_id, scope_hash,
    status: "ingested", visibility: "internal", verification_status: "pending",
  }).select("id").single();
  if (error || !opp) {
    if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    await db.from("workflow_failures").insert({ workflow: "intake", node: "insert_opportunity", payload: { submission_id: f.submission_id }, error: error?.message });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { data: consent } = await db.from("consents").insert({
    opportunity_id: opp.id, purpose: "share_request_with_eligible_contractors", sharing_scope: "matched_eligible_contractors",
    privacy_version: env.privacyVersion(),
    proof: { channel: "webflow_form", ip_hash: createHash("sha256").update(ip).digest("hex"), ua: req.headers.get("user-agent"), consent_share: true, consent_privacy: true, consent_text: "I agree to share this request and my contact details with up to 5 eligible, matched contractors through Archangel Advertising so they can contact me about this job. I can withdraw at any time. No contractor or outcome is guaranteed.", max_recipients: 5, at: new Date().toISOString() },
  }).select("id").single();
  await db.from("opportunities").update({ consent_id: consent?.id }).eq("id", opp.id);
  await db.from("lead_contacts").insert({ opportunity_id: opp.id, contact_name: f.name, email: f.email, phone: f.phone || null, address: f.address ?? null });

  // Similar-scope duplicates are flagged for a human, never auto-merged
  const { count } = await db.from("opportunities").select("id", { count: "exact", head: true }).eq("scope_hash", scope_hash).neq("id", opp.id);
  if (count) await db.from("moderation_queue").insert({ opportunity_id: opp.id, reason: "possible_duplicate", details: { scope_hash } });
  await audit("public", "intake_submitted", "opportunity", opp.id);

  // Hand off to n8n WF-01 (classification, email verification, review, matching)
  const hook = env.n8nIntakeWebhook();
  if (hook) {
    await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json", "x-shared-secret": env.n8nSecret() },
      body: JSON.stringify({ opportunity_id: opp.id, text: `${f.description}\nTimeline: ${f.timeline ?? "not stated"}\nZIP: ${f.zip}`, email: f.email,
        verify_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/intake/verify?id=${opp.id}&t=${verifyToken(opp.id)}` }) })
      .catch(async (e) => { await db.from("workflow_failures").insert({ workflow: "WF-01", node: "handoff", payload: { opportunity_id: opp.id }, error: String(e), next_retry_at: new Date(Date.now() + 60_000).toISOString() }); });
  }
  return NextResponse.json({ ok: true, opportunity_id: opp.id, next: "Check your email to verify your request." });
}

export async function OPTIONS(req: Request) { return preflight(req); }
