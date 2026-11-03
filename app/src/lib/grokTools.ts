import "server-only";
import { z } from "zod";
import { adminDb, audit } from "./supabase";
import { toJsonSchema } from "./xai";
import { TRADES, ZIP } from "./schemas";

/** The ONLY 7 functions Grok may call (spec §5). No SQL, billing writes, credentials, bulk publish or contact export. */
const Scope = z.object({
  trade: z.enum(TRADES), subtrades: z.array(z.string().max(60)).max(20), property_type: z.string().max(40),
  city: z.string().max(80).nullable(), zip: ZIP.nullable(), description: z.string().max(4000),
  timeline: z.string().max(200).nullable(), budget_min: z.number().nullable(), budget_max: z.number().nullable(),
});
export const ToolArgs = {
  search_public_opportunities: z.object({ trade: z.enum(TRADES).nullable(), zip: ZIP.nullable(), city: z.string().max(80).nullable(), kind: z.enum(["public_bid","discovery_signal"]).nullable() }),
  search_contractor_matches: z.object({ trade: z.enum(TRADES), location: z.string().max(80), requirements: z.array(z.string().max(60)).max(10) }),
  create_draft_job: z.object({ structured_scope: Scope }),
  update_draft_job: z.object({ job_id: z.string().uuid(), structured_scope: Scope }),
  submit_job_with_consent: z.object({ job_id: z.string().uuid(), consent_version: z.string().max(40) }),
  get_subscription_status: z.object({ org_id: z.string().uuid() }),
  request_human_review: z.object({ job_id: z.string().uuid(), reason: z.string().max(300) }),
} as const;
export type ToolName = keyof typeof ToolArgs;

const DESCRIPTIONS: Record<ToolName, string> = {
  search_public_opportunities: "Read approved, published public opportunity summaries.",
  search_contractor_matches: "Count/describe safe contractor matches. Returns no personal details.",
  create_draft_job: "Create a DRAFT job for the current user. Never published; user must confirm.",
  update_draft_job: "Update a draft job the current user owns.",
  submit_job_with_consent: "Submit a draft ONLY after the user explicitly said yes to the sharing consent shown in this conversation.",
  get_subscription_status: "Read subscription status for an organization the current user owns.",
  request_human_review: "Send a job to the human moderation queue.",
};

export const toolDefs = (Object.keys(ToolArgs) as ToolName[]).map((name) => ({
  type: "function", function: { name, description: DESCRIPTIONS[name], parameters: toJsonSchema(ToolArgs[name]) },
}));

export type ToolCtx = { userId: string; consentConfirmedVersion: string | null; ip?: string };

export async function runTool(name: string, rawArgs: string, ctx: ToolCtx): Promise<unknown> {
  if (!(name in ToolArgs)) return { error: "tool_not_allowed" };
  let json: unknown; try { json = JSON.parse(rawArgs); } catch { return { error: "bad_arguments" }; }
  const parsed = ToolArgs[name as ToolName].safeParse(json);
  if (!parsed.success) return { error: "invalid_arguments" };
  const a = parsed.data as never;
  const db = adminDb();
  await audit(ctx.userId, `grok_tool:${name}`, "tool", undefined, { args: json });

  switch (name as ToolName) {
    case "search_public_opportunities": {
      const f = a as z.infer<typeof ToolArgs.search_public_opportunities>;
      // Service role bypasses RLS, so the public filter is re-applied explicitly here.
      let q = db.from("opportunities").select("id,kind,title,summary,trade,city,zip,deadline,source_url,published_at")
        .eq("visibility", "public").in("status", ["published","matched","notified","responded"])
        .in("kind", ["public_bid","discovery_signal"]).eq("is_test_data", false).limit(10);
      if (f.trade) q = q.eq("trade", f.trade);
      if (f.zip) q = q.eq("zip", f.zip);
      if (f.city) q = q.ilike("city", f.city);
      if (f.kind) q = q.eq("kind", f.kind);
      const { data, error } = await q;
      return error ? { error: "query_failed" } : { results: data };
    }
    case "search_contractor_matches": {
      const f = a as z.infer<typeof ToolArgs.search_contractor_matches>;
      const { count } = await db.from("contractor_profiles").select("id", { count: "exact", head: true })
        .contains("trades", [f.trade]).eq("accepts_leads", true);
      return { eligible_contractor_count: count ?? 0, note: "Counts only. No contractor is guaranteed; no personal details shared." };
    }
    case "create_draft_job": {
      const s = (a as z.infer<typeof ToolArgs.create_draft_job>).structured_scope;
      const { data, error } = await db.from("opportunities").insert({
        kind: "private_lead", title: `${s.trade} request${s.city ? " in " + s.city : ""}`.slice(0, 120), summary: s.description.slice(0, 400),
        trade: s.trade, subtrades: s.subtrades, property_type: s.property_type, city: s.city, zip: s.zip,
        budget_min: s.budget_min, budget_max: s.budget_max, owner_user_id: ctx.userId, status: "draft", visibility: "internal",
      }).select("id").single();
      return error ? { error: "create_failed" } : { job_id: data.id, status: "draft" };
    }
    case "update_draft_job": {
      const { job_id, structured_scope: s } = a as z.infer<typeof ToolArgs.update_draft_job>;
      const { data } = await db.from("opportunities").update({
        trade: s.trade, subtrades: s.subtrades, property_type: s.property_type, city: s.city, zip: s.zip,
        summary: s.description.slice(0, 400), budget_min: s.budget_min, budget_max: s.budget_max,
      }).eq("id", job_id).eq("owner_user_id", ctx.userId).eq("status", "draft").select("id");
      return data?.length ? { ok: true } : { error: "not_found_or_not_owner" };
    }
    case "submit_job_with_consent": {
      const { job_id, consent_version } = a as z.infer<typeof ToolArgs.submit_job_with_consent>;
      // Consent must come from an explicit UI confirmation passed by the client, not from the model.
      if (!ctx.consentConfirmedVersion || ctx.consentConfirmedVersion !== consent_version) return { error: "explicit_user_consent_required" };
      const { data: job } = await db.from("opportunities").select("id").eq("id", job_id).eq("owner_user_id", ctx.userId).eq("status", "draft").maybeSingle();
      if (!job) return { error: "not_found_or_not_owner" };
      const { data: c } = await db.from("consents").insert({
        subject_user_id: ctx.userId, opportunity_id: job_id, purpose: "share_request_with_eligible_contractors",
        sharing_scope: "matched_eligible_contractors", privacy_version: consent_version, proof: { channel: "chat", ip: ctx.ip ?? null, at: new Date().toISOString() },
      }).select("id").single();
      if (!c) return { error: "consent_failed" };
      await db.from("opportunities").update({ consent_id: c.id, status: "needs_review", verification_status: "pending" }).eq("id", job_id);
      await db.from("moderation_queue").insert({ opportunity_id: job_id, reason: "new_submission_review" });
      return { ok: true, status: "submitted_for_review" };
    }
    case "get_subscription_status": {
      const { org_id } = a as z.infer<typeof ToolArgs.get_subscription_status>;
      const { data: org } = await db.from("organizations").select("id").eq("id", org_id).eq("owner_user_id", ctx.userId).maybeSingle();
      if (!org) return { error: "not_owner" };
      const { data } = await db.from("subscriptions").select("plan,status,current_period_end").eq("organization_id", org_id).maybeSingle();
      return data ?? { plan: "free", status: "none" };
    }
    case "request_human_review": {
      const { job_id, reason } = a as z.infer<typeof ToolArgs.request_human_review>;
      const { data: job } = await db.from("opportunities").select("id").eq("id", job_id).eq("owner_user_id", ctx.userId).maybeSingle();
      if (!job) return { error: "not_found_or_not_owner" };
      await db.from("moderation_queue").insert({ opportunity_id: job_id, reason: reason.slice(0, 300) });
      return { ok: true };
    }
  }
}
