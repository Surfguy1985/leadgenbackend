import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_PLANS } from "./billing";

export const REF_COOKIE = "cf_ref";
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i
export function newCode(len = 8, rnd: (n: number) => Buffer = randomBytes): string {
  const b = rnd(len); let s = ""; for (let i = 0; i < len; i++) s += ALPHA[b[i] % ALPHA.length]; return s;
}
/** Normalize an untrusted ?ref= / path code; null if not a plausible code. */
export function normCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null; const c = raw.trim().toLowerCase();
  return /^[a-z0-9]{6,12}$/.test(c) ? c : null;
}
export const referralLink = (appUrl: string, code: string) => `${appUrl.replace(/\/$/, "")}/r/${code}`;
/** A referral converts the first time the referred org has an active/trialing-free paid plan. Trials don't count. */
export function isConversion(planCode: string, status: string): boolean {
  return (PAID_PLANS as readonly string[]).includes(planCode) && status === "active";
}
export type RefStats = { signups: number; converted: number; rewardsPending: number };
export function stats(rows: { status: string; reward_status: string }[]): RefStats {
  return { signups: rows.filter(r => r.status !== "void").length, converted: rows.filter(r => r.status === "converted").length, rewardsPending: rows.filter(r => r.reward_status === "pending_review").length };
}

export async function ensureCode(db: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await db.from("referral_codes").select("code").eq("organization_id", orgId).maybeSingle();
  if (data?.code) return data.code;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const { error } = await db.from("referral_codes").insert({ organization_id: orgId, code });
    if (!error) return code;
    if (error.code === "23505") { const again = await db.from("referral_codes").select("code").eq("organization_id", orgId).maybeSingle(); if (again.data?.code) return again.data.code; continue; }
    throw new Error(`referral_code: ${error.message}`);
  }
  throw new Error("referral_code: collisions");
}
/** Record a signup attribution. Ignores self-referral, unknown codes and already-referred orgs. */
export async function attributeSignup(db: SupabaseClient, referredOrgId: string, rawCode: unknown): Promise<boolean> {
  const code = normCode(rawCode); if (!code) return false;
  const { data: rc } = await db.from("referral_codes").select("organization_id").eq("code", code).maybeSingle();
  if (!rc || rc.organization_id === referredOrgId) return false;
  const { error } = await db.from("referrals").insert({ referrer_org_id: rc.organization_id, referred_org_id: referredOrgId, code });
  return !error;
}
/** Mark converted once (idempotent). Reward stays pending_review for Bryce: suggested 1 free month via a TEST-mode Stripe coupon. */
export async function markConverted(db: SupabaseClient, referredOrgId: string): Promise<boolean> {
  const { data } = await db.from("referrals").update({ status: "converted", converted_at: new Date().toISOString(), reward_status: "pending_review",
    reward_note: "Suggested: 1 free month for the referrer (Stripe TEST coupon REFERRAL1MO, 100% off, duration once). Needs Bryce's approval." })
    .eq("referred_org_id", referredOrgId).eq("status", "signed_up").select("id");
  return !!data?.length;
}
