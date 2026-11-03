import type { Classification } from "./schemas";
/** Deterministic gate: model confidence never overrides permission/consent rules. */
export function reviewReasons(c: Classification, ctx: { sourceKind: string; hasConsent: boolean }): string[] {
  const r: string[] = [];
  if (c.needs_review) r.push(c.review_reason || "model_flagged");
  if (c.suspected_prompt_injection) r.push("suspected_prompt_injection");
  if (c.trade === "other") r.push("unknown_trade");
  if (!c.zip && !c.city) r.push("missing_location");
  if (c.state && c.state !== "TX") r.push("out_of_market");
  if (ctx.sourceKind === "community_referral" && !ctx.hasConsent) r.push("discovery_signal_no_consent");
  if (c.verification_status === "verified" && !ctx.hasConsent && ctx.sourceKind !== "official_api") r.push("model_claimed_verification");
  if (c.budget_min != null && c.budget_max != null && c.budget_min > c.budget_max) r.push("budget_inconsistent");
  return r;
}
