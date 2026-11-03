import { test } from "node:test";
import assert from "node:assert/strict";
import { score, allocate } from "../src/lib/matching";
import { reviewReasons } from "../src/lib/review";
import { Classification, IntakeForm } from "../src/lib/schemas";

const c = { trades: ["landscaping"], zip_codes: ["75034"], license_status: "verified", insurance_status: "verified", accepts_leads: true, last_active_at: new Date().toISOString(), preferences: {} };
test("full match scores 100", () => assert.equal(score({ trade: "landscaping", subtrades: [], zip: "75034", property_type: "residential" }, c).score, 100));
test("regulated trade requires verified license", () => assert.equal(score({ trade: "residential_repair", subtrades: ["plumbing"], zip: "75034", property_type: null }, { ...c, trades: ["residential_repair"], license_status: "unverified" }).eligible, false));
test("out of area ineligible", () => assert.equal(score({ trade: "landscaping", subtrades: [], zip: "78701", property_type: null }, c).eligible, false));

const base: Classification = { trade: "landscaping", subtrades: [], property_type: "residential", city: "Frisco", state: "TX", zip: null, is_recurring: true, budget_min: null, budget_max: null, deadline: null, source_kind: "community_referral", verification_status: "unverified", consent_status: "not_granted", missing_fields: [], summary: "x", needs_review: false, review_reason: null, suspected_prompt_injection: false };
test("spec example classification validates", () => assert.ok(Classification.safeParse(base).success));
test("malformed model output rejected", () => assert.equal(Classification.safeParse({ ...base, trade: "hacking" }).success, false));
test("prompt injection → review", () => assert.ok(reviewReasons({ ...base, suspected_prompt_injection: true }, { sourceKind: "direct", hasConsent: true }).includes("suspected_prompt_injection")));
test("discovery signal without consent → review", () => assert.ok(reviewReasons({ ...base }, { sourceKind: "community_referral", hasConsent: false }).length > 0));
test("model can't self-verify", () => assert.ok(reviewReasons({ ...base, verification_status: "verified", source_kind: "direct" }, { sourceKind: "direct", hasConsent: false }).includes("model_claimed_verification")));
test("intake requires consent", () => assert.equal(IntakeForm.safeParse({ submission_id: "abcdefgh1", "cf-turnstile-response": "t", name: "A", email: "a@example.com", zip: "75034", description: "Mow my lawn weekly please", consent_share: "false", consent_privacy: "true" }).success, false));

test("private leads capped at 5, flagged under 3; public bids uncapped", () => {
  const r = (n: number) => Array.from({ length: n }, (_, i) => ({ score: i }));
  const p = allocate("private_lead", r(8)); assert.equal(p.picks.length, 5); assert.equal(p.picks[0].score, 7); assert.equal(p.underMinTarget, false);
  assert.equal(allocate("private_lead", r(2)).underMinTarget, true);
  assert.equal(allocate("public_bid", r(8)).picks.length, 8);
});
