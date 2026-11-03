import { createHash } from "node:crypto";

export const PAID_PLANS = ["starter", "pro_match", "growth", "elite"] as const;
export type PlanRow = { code: string; stripe_price_id: string | null; trial_days: number; purchasable: boolean };

/** Plan code from a Stripe price id, using the plans table (never client input). Unknown price → null (caller must not grant). */
export function planForPrice(plans: PlanRow[], priceId: string | undefined | null): string | null {
  if (!priceId) return null;
  return plans.find(p => p.stripe_price_id === priceId)?.code ?? null;
}

/** RT-06 out-of-order protection: apply only if this event is newer than the last one applied. */
export function shouldApply(lastApplied: string | null | undefined, eventCreatedSec: number): boolean {
  if (!lastApplied) return true;
  return eventCreatedSec * 1000 > new Date(lastApplied).getTime();
}

export function payloadHash(raw: string): string { return createHash("sha256").update(raw).digest("hex"); }

/** Trial eligibility: one trial per org, only for plans with trial_days > 0. */
export function trialDaysFor(plan: PlanRow, orgHadTrial: boolean): number | undefined {
  return !orgHadTrial && plan.trial_days > 0 ? plan.trial_days : undefined;
}

/** Normalizes Stripe subscription status to our sub_status enum. */
export function normStatus(s: string): string {
  if (s === "incomplete_expired") return "canceled";
  return s;
}

/** Entitlement gate: trial or free never gets contact reveal (v3 decision). */
export function canRevealContact(planCode: string, status: string): boolean {
  return planCode !== "free" && status === "active";
}
