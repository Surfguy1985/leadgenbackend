import { test } from "node:test";
import assert from "node:assert/strict";
import { isDfwZip, isTexasZip, lifecycleDates, newToken, hashToken } from "../src/lib/homeowner";
import { IntakeForm, ManageAction } from "../src/lib/schemas";
test("DFW market", () => { for (const z of ["75201", "76102", "75034", "76244"]) assert.ok(isDfwZip(z), z); for (const z of ["77002", "78701", "10001", "7520"]) assert.ok(!isDfwZip(z), z); assert.ok(isTexasZip("77002") && !isTexasZip("10001")); });
test("lifecycle dates per urgency", () => {
  const now = new Date("2026-11-03T00:00:00Z");
  assert.equal(lifecycleDates("urgent", now).hide_after, "2026-11-06T00:00:00.000Z");
  assert.equal(lifecycleDates("normal", now).reconfirm_due_at, "2026-11-10T00:00:00.000Z");
  assert.equal(lifecycleDates("normal", now).hide_after, "2026-11-17T00:00:00.000Z");
  assert.equal(lifecycleDates("recurring", now).hide_after, "2026-12-03T00:00:00.000Z");
});
test("manage tokens are random and stored hashed", () => { const a = newToken(), b = newToken(); assert.notEqual(a.token, b.token); assert.equal(a.hash, hashToken(a.token)); assert.notEqual(a.hash, a.token); assert.ok(a.token.length >= 43); });
test("intake v2 fields optional + validated; public listing is separate opt-in", () => {
  const base = { submission_id: "abcdefgh1", "cf-turnstile-response": "x", name: "A", email: "a@b.co", zip: "75201", description: "Fix my fence please", consent_share: "true", consent_privacy: "true" };
  assert.ok(IntakeForm.safeParse(base).success);
  assert.ok(IntakeForm.safeParse({ ...base, urgency: "urgent", consent_public_listing: "true" }).success);
  assert.ok(!IntakeForm.safeParse({ ...base, urgency: "asap" }).success);
  assert.ok(!IntakeForm.safeParse({ ...base, consent_share: "false" }).success);
  assert.ok(!ManageAction.safeParse({ token: "short", action: "withdraw" }).success);
  assert.ok(!ManageAction.safeParse({ token: "x".repeat(43), action: "delete_everything" }).success);
});
