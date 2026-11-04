import "server-only";
import { Classification } from "@/lib/schemas";
import { SYSTEM_PROMPT, wrapUntrusted, xaiStructured } from "@/lib/xai";
import { reviewReasons } from "@/lib/review";
import { looksLikeInjection } from "@/lib/aiGuard";
import { adminDb, audit } from "@/lib/supabase";
import { env } from "@/lib/env";
import { verifyToken } from "@/lib/scope";
import { newToken } from "@/lib/homeowner";
import { sendEmail } from "@/lib/email";
import { auditStore, runStep } from "@/lib/steps";
import { pickMatches, type Candidate } from "@/lib/matching";

/* In-app replacements for the former n8n workflows:
 *  WF-01 direct intake  -> runIntakeWorkflow (after() from /api/intake, retried by the daily sweep)
 *  WF-04 match/notify   -> matchAndNotify (after() from admin approval, retried by the sweep)
 *  WF-06 freshness      -> runFreshness (daily cron)
 *  WF-09 ops/retries    -> recordFailure + retrySweep (daily cron)
 *  WF-02 SAM.gov ingest -> already in-app (runSamGov in daily cron) */

type Db = ReturnType<typeof adminDb>;
type SourceKind = "official_api" | "partner" | "direct" | "community_referral";

export async function classifyOpportunity(db: Db, a: { text: string; source_kind: SourceKind; has_consent: boolean; opportunity_id?: string; raw_ingestion_id?: string }) {
  if (!process.env.XAI_API_KEY) {
    await db.from("moderation_queue").insert({ opportunity_id: a.opportunity_id ?? null, raw_ingestion_id: a.raw_ingestion_id ?? null, reason: "classification_unavailable", details: {} });
    await audit("system", "classify_skipped", "opportunity", a.opportunity_id, { reason: "XAI_API_KEY missing" });
    return { ok: false as const, needs_review: true, error: "not_configured" };
  }
  const r = await xaiStructured(Classification, "opportunity_classification", [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Source kind: ${a.source_kind}. Consent on file: ${a.has_consent}. Classify:\n${wrapUntrusted(a.text)}` },
  ]);
  if (!r.ok) {
    await db.from("moderation_queue").insert({ opportunity_id: a.opportunity_id ?? null, raw_ingestion_id: a.raw_ingestion_id ?? null, reason: "classification_failed", details: { error: r.error } });
    await audit("system", "classify_failed", "opportunity", a.opportunity_id, { error: r.error });
    return { ok: false as const, needs_review: true, error: r.error };
  }
  const c = r.data;
  if (looksLikeInjection(a.text)) c.suspected_prompt_injection = true;
  if (!a.has_consent) c.consent_status = "not_granted";
  if (a.source_kind !== "official_api" && !a.has_consent) c.verification_status = "unverified";
  const reasons = reviewReasons(c, { sourceKind: a.source_kind, hasConsent: a.has_consent });
  if (a.opportunity_id) {
    await db.from("opportunities").update({
      trade: c.trade, subtrades: c.subtrades, property_type: c.property_type, city: c.city, zip: c.zip,
      is_recurring: c.is_recurring, budget_min: c.budget_min, budget_max: c.budget_max, summary: c.summary,
      status: reasons.length ? "needs_review" : "classified",
    }).eq("id", a.opportunity_id);
  }
  if (reasons.length) await db.from("moderation_queue").insert({ opportunity_id: a.opportunity_id ?? null, raw_ingestion_id: a.raw_ingestion_id ?? null, reason: reasons.join(","), details: { classification: c } });
  await audit("system", "classified", "opportunity", a.opportunity_id, { reasons });
  return { ok: true as const, classification: c, needs_review: reasons.length > 0, review_reasons: reasons };
}

/** Failures are recorded (no PII in payload) with exponential backoff; after 5 attempts they dead-letter into /admin. */
export async function recordFailure(db: Db, workflow: string, node: string, error: unknown, payload: Record<string, unknown>) {
  await db.rpc("record_workflow_failure", { p_workflow: workflow, p_node: node, p_error: String(error).slice(0, 2000), p_payload: payload });
}

/** WF-01: classify -> verification email. Idempotent per opportunity via audit-log step keys. `text` and `manageToken` are only present on the first run. */
export async function runIntakeWorkflow(oppId: string, first?: { text: string; manageToken: string }): Promise<boolean> {
  const db = adminDb(); const store = auditStore(db, "app:WF-01");
  try {
    await runStep(store, `wf01:${oppId}:classify`, async () => {
      if (!first) { // retry without the original text: route to human review rather than guess
        await db.from("moderation_queue").insert({ opportunity_id: oppId, reason: "classification_failed", details: { error: "retry_without_text" } });
        return { result: "sent_to_review" };
      }
      const r = await classifyOpportunity(db, { opportunity_id: oppId, source_kind: "direct", has_consent: true, text: first.text });
      return { result: r.ok ? "classified" : "review", needs_review: r.needs_review };
    });
    await runStep(store, `wf01:${oppId}:verify_email`, async () => {
      const { data: c } = await db.from("lead_contacts").select("email").eq("opportunity_id", oppId).maybeSingle();
      if (!c?.email) return { result: "no_email" };
      let manage = first?.manageToken;
      if (!manage) { const t = newToken(); manage = t.token; await db.from("manage_tokens").insert({ opportunity_id: oppId, token_hash: t.hash, purpose: "manage", expires_at: new Date(Date.now() + 60 * 24 * 3600_000).toISOString() }); }
      const app = env.appUrl();
      const verifyUrl = `${app}/api/intake/verify?id=${oppId}&t=${verifyToken(oppId)}`;
      const r = await sendEmail({ to: c.email, idempotencyKey: `wf01-verify-${oppId}`, subject: "Crewforthat: confirm your service request",
        html: `<p>Thanks for using Crewforthat. Please confirm your request so we can share it with up to 5 eligible, matched contractors.</p><p><a href="${verifyUrl}">Confirm request</a></p><p>Manage or withdraw your request: <a href="${app}/manage?t=${manage}">${app}/manage</a></p><p>No contractor is guaranteed. You can withdraw anytime at ${app}/delete-data.</p>` });
      if ("error" in r) throw new Error(r.error);
      return { result: r.sent ? "sent" : "skipped_no_email_provider" };
    });
    return true;
  } catch (e) { await recordFailure(db, "WF-01", "run", e, { opportunity_id: oppId }); return false; }
}

/** WF-04: score eligible contractors, upsert matches, queue deduped notifications, email when configured. */
export async function matchAndNotify(oppId: string): Promise<boolean> {
  const db = adminDb(); const store = auditStore(db, "app:WF-04");
  try {
    await runStep(store, `wf04:${oppId}:match`, async () => {
      const { data: o } = await db.from("opportunities").select("id,kind,title,trade,subtrades,zip,city,property_type,status").eq("id", oppId).maybeSingle();
      if (!o || o.status !== "published") return { result: "not_published" };
      const { data: rows } = await db.from("contractor_profiles").select("*,organizations(owner_user_id,subscriptions(plan,status))").contains("trades", [o.trade]).eq("accepts_leads", true);
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      // Private leads remain paid-only by default. A tightly controlled, server-side
      // allowlist permits known contractor organizations in the closed pilot without
      // publishing checkout or allowing users to self-assign a pilot entitlement.
      const pilotOrgIds = new Set((process.env.PILOT_CONTRACTOR_ORG_IDS ?? "")
        .split(",").map(x => x.trim()).filter(x => /^[0-9a-f-]{36}$/i.test(x)));
      const { data: pri } = await db.from("priority_slots").select("organization_id").eq("trade", o.trade);
      const priority = new Set((pri ?? []).map((r: { organization_id: string }) => r.organization_id));
      const cands: Candidate[] = [];
      for (const c of rows ?? []) {
        const owner = c.organizations?.owner_user_id ?? null; const subs = c.organizations?.subscriptions ?? [];
        let sentToday = 0;
        if (owner) { const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", owner).gte("created_at", since.toISOString()); sentToday = count ?? 0; }
        cands.push({ ...c, owner_user_id: owner, paid: subs.some((s: { status: string }) => ["active", "trialing"].includes(s.status)) || pilotOrgIds.has(c.organization_id), alerts_left: (c.max_alerts_daily ?? 10) - sentToday, priority: priority.has(c.organization_id) });
      }
      const { picks, underMinTarget } = pickMatches({ ...o, subtrades: o.subtrades ?? [] }, cands);
      let emailed = 0, queued = 0;
      for (const p of picks) {
        await db.from("matches").upsert({ opportunity_id: oppId, contractor_id: p.contractor_id, match_score: p.score, match_factors: p.factors }, { onConflict: "opportunity_id,contractor_id", ignoreDuplicates: true });
        const dedupe_key = `opp:${oppId}:user:${p.owner_user_id}:email`;
        const { data: n } = await db.from("notifications").upsert({ recipient_id: p.owner_user_id, opportunity_id: oppId, channel: "email", status: "queued", dedupe_key }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
        if (!n?.length) continue; queued++;
        const { data: u } = await db.auth.admin.getUserById(p.owner_user_id);
        if (!u?.user?.email) continue;
        const r = await sendEmail({ to: u.user.email, idempotencyKey: dedupe_key, subject: `New ${o.kind === "public_bid" ? "public bid" : "verified request"}: ${o.title}`,
          html: `<p>${o.city ?? ""} ${o.zip ?? ""}</p><p><a href="${env.appUrl()}/dashboard">View in your dashboard</a></p><p style="font-size:12px">Match score is a routing heuristic, not a guarantee of work. Sent by Crewforthat.</p>` });
        if (r.sent) { emailed++; await db.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("dedupe_key", dedupe_key); }
      }
      return { result: "matched", matches: picks.length, queued, emailed, under_min_target: underMinTarget };
    });
    return true;
  } catch (e) { await recordFailure(db, "WF-04", "run", e, { opportunity_id: oppId }); return false; }
}

/** WF-06 (minus the SAM.gov per-notice recheck): expire past deadline / expires_at, suppress queued alerts for closed items. */
export async function runFreshness() {
  const db = adminDb(); const now = new Date().toISOString(); const open = ["published", "matched", "notified"];
  const a = await db.from("opportunities").update({ status: "expired", visibility: "internal" }).lt("deadline", now).in("status", open).select("id");
  const b = await db.from("opportunities").update({ status: "expired", visibility: "internal" }).lt("expires_at", now).in("status", open).select("id");
  const s = await db.rpc("suppress_closed_notifications");
  const out = { expired_deadline: a.data?.length ?? 0, expired_expires_at: b.data?.length ?? 0, suppressed: s.data ?? 0, errors: [a.error, b.error, s.error].filter(Boolean).map(e => e!.message) };
  await audit("app:WF-06", "freshness_run", "opportunities", undefined, out);
  return out;
}

/** WF-09 retry sweep: re-run due WF-01/WF-04 failures. Steps are idempotent, so re-running is safe. */
export async function retrySweep() {
  const db = adminDb();
  const { data } = await db.from("workflow_failures").select("id,workflow,payload,attempts").eq("state", "retrying").lt("next_retry_at", new Date().toISOString()).in("workflow", ["WF-01", "WF-04"]).limit(25);
  let resolved = 0;
  for (const f of data ?? []) {
    const id = (f.payload as { opportunity_id?: string })?.opportunity_id; if (!id) continue;
    // On failure, record_workflow_failure bumps attempts/backoff on this same row (dead_letter after 5).
    const ok = f.workflow === "WF-01" ? await runIntakeWorkflow(id) : await matchAndNotify(id);
    if (ok) { await db.from("workflow_failures").update({ state: "resolved" }).eq("id", f.id); resolved++; }
  }
  if (data?.length) await audit("app:WF-09", "retry_sweep", "workflow_failures", undefined, { due: data.length, resolved });
  return { due: data?.length ?? 0, resolved };
}
