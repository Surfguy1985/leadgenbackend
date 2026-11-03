import { NextResponse } from "next/server";
import { z } from "zod";
import { Classification } from "@/lib/schemas";
import { SYSTEM_PROMPT, wrapUntrusted, xaiStructured } from "@/lib/xai";
import { reviewReasons } from "@/lib/review";
import { looksLikeInjection } from "@/lib/aiGuard";
import { adminDb, audit } from "@/lib/supabase";
import { safeEqual } from "@/lib/rateLimit";
import { env, missingEnv } from "@/lib/env";

export const runtime = "nodejs";

const Body = z.object({
  opportunity_id: z.string().uuid().optional(),
  raw_ingestion_id: z.string().uuid().optional(),
  source_kind: z.enum(["official_api","partner","direct","community_referral"]),
  has_consent: z.boolean().default(false),
  text: z.string().min(1).max(20000),
  dry_run: z.boolean().default(false), // smoke tests: classify + review rules, no DB writes (audit_logs is append-only)
});

/** Server-to-server only (n8n WF-01/WF-02, /api/intake). Auth: x-shared-secret. */
export async function POST(req: Request) {
  const secret = req.headers.get("x-shared-secret") ?? "";
  if (!process.env.N8N_WEBHOOK_SHARED_SECRET || !safeEqual(secret, env.n8nSecret())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const nc = missingEnv("XAI_API_KEY"); if (nc) return nc;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad_request", issues: b.error.issues }, { status: 400 });
  const { text, source_kind, has_consent, opportunity_id, raw_ingestion_id, dry_run } = b.data;

  const r = await xaiStructured(Classification, "opportunity_classification", [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Source kind: ${source_kind}. Consent on file: ${has_consent}. Classify:\n${wrapUntrusted(text)}` },
  ]);

  if (dry_run) {
    if (!r.ok) return NextResponse.json({ ok: false, needs_review: true, error: r.error, dry_run: true });
    const d = r.data; if (looksLikeInjection(text)) d.suspected_prompt_injection = true; if (!has_consent) d.consent_status = "not_granted"; if (source_kind !== "official_api" && !has_consent) d.verification_status = "unverified";
    const rr = reviewReasons(d, { sourceKind: source_kind, hasConsent: has_consent });
    return NextResponse.json({ ok: true, dry_run: true, classification: d, needs_review: rr.length > 0, review_reasons: rr });
  }
  const db = adminDb();
  if (!r.ok) {
    // malformed JSON / timeout / schema failure → human review, never dropped
    await db.from("moderation_queue").insert({ opportunity_id: opportunity_id ?? null, raw_ingestion_id: raw_ingestion_id ?? null, reason: "classification_failed", details: { error: r.error } });
    await audit("system", "classify_failed", "opportunity", opportunity_id, { error: r.error });
    return NextResponse.json({ ok: false, needs_review: true, error: r.error }, { status: 200 });
  }
  const c = r.data;
  if (looksLikeInjection(text)) c.suspected_prompt_injection = true; // heuristic backstop, model can miss it
  // Never trust model claims on consent/verification
  if (!has_consent) c.consent_status = "not_granted";
  if (source_kind !== "official_api" && !has_consent) c.verification_status = "unverified";
  const reasons = reviewReasons(c, { sourceKind: source_kind, hasConsent: has_consent });

  if (opportunity_id) {
    await db.from("opportunities").update({
      trade: c.trade, subtrades: c.subtrades, property_type: c.property_type, city: c.city, zip: c.zip,
      is_recurring: c.is_recurring, budget_min: c.budget_min, budget_max: c.budget_max, summary: c.summary,
      status: reasons.length ? "needs_review" : "classified",
    }).eq("id", opportunity_id);
  }
  if (reasons.length) await db.from("moderation_queue").insert({ opportunity_id: opportunity_id ?? null, raw_ingestion_id: raw_ingestion_id ?? null, reason: reasons.join(","), details: { classification: c } });
  await audit("system", "classified", "opportunity", opportunity_id, { reasons });
  return NextResponse.json({ ok: true, classification: c, needs_review: reasons.length > 0, review_reasons: reasons });
}
