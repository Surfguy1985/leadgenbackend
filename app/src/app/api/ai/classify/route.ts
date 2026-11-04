import { NextResponse } from "next/server";
import { z } from "zod";
import { Classification } from "@/lib/schemas";
import { SYSTEM_PROMPT, wrapUntrusted, xaiStructured } from "@/lib/xai";
import { reviewReasons } from "@/lib/review";
import { looksLikeInjection } from "@/lib/aiGuard";
import { adminDb } from "@/lib/supabase";
import { classifyOpportunity } from "@/lib/workflows";
import { safeEqual } from "@/lib/rateLimit";
import { env, missingEnv, hasSharedSecret } from "@/lib/env";

export const runtime = "nodejs";

const Body = z.object({
  opportunity_id: z.string().uuid().optional(),
  raw_ingestion_id: z.string().uuid().optional(),
  source_kind: z.enum(["official_api","partner","direct","community_referral"]),
  has_consent: z.boolean().default(false),
  text: z.string().min(1).max(20000),
  dry_run: z.boolean().default(false), // smoke tests: classify + review rules, no DB writes (audit_logs is append-only)
});

/** Server-to-server only (manual/admin tooling; intake uses lib/workflows directly). Auth: x-shared-secret. */
export async function POST(req: Request) {
  const secret = req.headers.get("x-shared-secret") ?? "";
  if (!hasSharedSecret() || !safeEqual(secret, env.sharedSecret())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const nc = missingEnv("XAI_API_KEY"); if (nc) return nc;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad_request", issues: b.error.issues }, { status: 400 });
  const { text, source_kind, has_consent, opportunity_id, raw_ingestion_id, dry_run } = b.data;

  if (dry_run) {
  const r = await xaiStructured(Classification, "opportunity_classification", [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Source kind: ${source_kind}. Consent on file: ${has_consent}. Classify:\n${wrapUntrusted(text)}` },
  ]);

    if (!r.ok) return NextResponse.json({ ok: false, needs_review: true, error: r.error, dry_run: true });
    const d = r.data; if (looksLikeInjection(text)) d.suspected_prompt_injection = true; if (!has_consent) d.consent_status = "not_granted"; if (source_kind !== "official_api" && !has_consent) d.verification_status = "unverified";
    const rr = reviewReasons(d, { sourceKind: source_kind, hasConsent: has_consent });
    return NextResponse.json({ ok: true, dry_run: true, classification: d, needs_review: rr.length > 0, review_reasons: rr });
  }
  return NextResponse.json(await classifyOpportunity(adminDb(), { text, source_kind, has_consent, opportunity_id, raw_ingestion_id }));
}
