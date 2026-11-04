import { reserveFounding, track } from "@/lib/monetization";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Business-claim verification (spec RT-05): domain-email challenge or human review of proof. Never phone-only. */
export const CLAIM_TTL_MS = 15 * 60_000;
export const CLAIM_MAX_ATTEMPTS = 5;
export const CLAIM_MAX_SENDS_PER_DAY = 3;
const FREE_MAIL = new Set(["gmail.com","googlemail.com","yahoo.com","outlook.com","hotmail.com","live.com","msn.com","aol.com","icloud.com","me.com","proton.me","protonmail.com","gmx.com","mail.com","yandex.com","zoho.com","att.net","sbcglobal.net","comcast.net"]);

/** Registrable-ish host of a website ("https://www.acme.com/x" -> "acme.com"). */
export function siteDomain(website?: string | null): string | null {
  if (!website) return null;
  try { const h = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, ""); return h.includes(".") ? h : null; } catch { return null; }
}
/** The claim email must be on the business's own website domain (or a subdomain) and not a free mailbox. */
export function emailOnDomain(email: string, website?: string | null): boolean {
  const d = siteDomain(website); const m = email.trim().toLowerCase().match(/^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!d || !m || FREE_MAIL.has(d) || FREE_MAIL.has(m[1])) return false;
  return m[1] === d || m[1].endsWith(`.${d}`);
}
export const hashCode = (claimId: string, code: string) => createHash("sha256").update(`${claimId}:${code}`).digest("hex");
export function newChallenge(claimId: string, now = Date.now()) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, hash: hashCode(claimId, code), expiresAt: new Date(now + CLAIM_TTL_MS).toISOString() };
}
export type CheckResult = "ok" | "expired" | "too_many_attempts" | "wrong_code" | "not_pending";
export function checkChallenge(row: { id: string; status: string; challenge_hash: string | null; challenge_expires_at: string | null; attempts: number }, code: string, now = Date.now()): CheckResult {
  if (row.status !== "challenge_sent" || !row.challenge_hash) return "not_pending";
  if (row.attempts >= CLAIM_MAX_ATTEMPTS) return "too_many_attempts";
  if (!row.challenge_expires_at || Date.parse(row.challenge_expires_at) < now) return "expired";
  const a = Buffer.from(hashCode(row.id, String(code).trim())), b = Buffer.from(row.challenge_hash);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "wrong_code";
}

/** Transfers a directory org to the claimant. Idempotent; refuses if someone else already owns it. */
export async function approveClaim(db: SupabaseClient, claimId: string, actor: string, reason: string) {
  const { data: c } = await db.from("profile_claims").select("id,organization_id,claimant_user_id,status").eq("id", claimId).single();
  if (!c) throw new Error("claim_not_found");
  if (c.status === "approved") return { ok: true, already: true };
  const { data: org } = await db.from("organizations").select("id,owner_user_id").eq("id", c.organization_id).single();
  if (org?.owner_user_id && org.owner_user_id !== c.claimant_user_id) throw new Error("already_owned");
  const now = new Date().toISOString();
  const { error } = await db.from("organizations").update({ owner_user_id: c.claimant_user_id, claim_status: "claimed", verified_status: "verified" }).eq("id", c.organization_id).is("owner_user_id", null);
  if (error) throw new Error(`org_update: ${error.message}`);
  await db.from("profile_claims").update({ status: "approved", reviewed_by: actor === "system" ? null : actor, decided_at: now, decision_reason: reason, challenge_hash: null }).eq("id", claimId);
  await db.from("profile_claims").update({ status: "rejected", decided_at: now, decision_reason: "another_claim_approved" }).eq("organization_id", c.organization_id).neq("id", claimId).in("status", ["pending", "challenge_sent", "verified"]);
  const { data: prof } = await db.from("profiles").select("role").eq("user_id", c.claimant_user_id).maybeSingle();
  if (!prof) await db.from("profiles").insert({ user_id: c.claimant_user_id, role: "contractor" });
  await db.from("contractor_profiles").upsert({ organization_id: c.organization_id }, { onConflict: "organization_id", ignoreDuplicates: true });
  { const { data: o } = await db.from("organizations").select("id,city,primary_trade").eq("id", c.organization_id).maybeSingle();
    if (o) { const org = { id: o.id, city: o.city, trade: o.primary_trade }; await track(db, "verified", { ...org, city: (o.city ?? "").toLowerCase() }); await reserveFounding(db, org); } }
  await db.from("audit_logs").insert({ actor, action: "profile_claim_approved", object_type: "organization", object_id: c.organization_id, metadata: { claim_id: claimId, reason, plan: "free" } });
  return { ok: true, already: false };
}
/** Undo an approval (dispute upheld / fraud): ownership removed, profile back to unclaimed. */
export async function rollbackClaim(db: SupabaseClient, claimId: string, actor: string, reason: string) {
  const { data: c } = await db.from("profile_claims").select("id,organization_id,claimant_user_id,status").eq("id", claimId).single();
  if (!c || c.status !== "approved") throw new Error("not_approved");
  await db.from("organizations").update({ owner_user_id: null, claim_status: "unclaimed", verified_status: "unverified" }).eq("id", c.organization_id).eq("owner_user_id", c.claimant_user_id);
  await db.from("profile_claims").update({ status: "rolled_back", reviewed_by: actor, decided_at: new Date().toISOString(), decision_reason: reason }).eq("id", claimId);
  await db.from("audit_logs").insert({ actor, action: "profile_claim_rolled_back", object_type: "organization", object_id: c.organization_id, metadata: { claim_id: claimId, reason } });
}
