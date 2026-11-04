import { test } from "node:test";
import assert from "node:assert/strict";
import { siteDomain, emailOnDomain, newChallenge, checkChallenge, CLAIM_MAX_ATTEMPTS, CLAIM_TTL_MS } from "../src/lib/claims";

test("site domain parsing", () => {
  assert.equal(siteDomain("https://www.Acme-Roofing.com/about"), "acme-roofing.com");
  assert.equal(siteDomain("acme.com"), "acme.com");
  assert.equal(siteDomain(""), null); assert.equal(siteDomain("not a url"), null);
});
test("claim email must be on the business domain, never free mail", () => {
  assert.ok(emailOnDomain("Owner@acme.com", "https://www.acme.com"));
  assert.ok(emailOnDomain("o@mail.acme.com", "acme.com"));
  assert.ok(!emailOnDomain("o@acme.com.evil.io", "acme.com"));
  assert.ok(!emailOnDomain("o@notacme.com", "acme.com"));
  assert.ok(!emailOnDomain("o@gmail.com", "https://gmail.com"));
  assert.ok(!emailOnDomain("o@acme.com", null));
});
test("challenge: right code ok, wrong code, expiry, attempt cap, status", () => {
  const now = Date.now(); const ch = newChallenge("c1", now);
  assert.match(ch.code, /^\d{6}$/);
  const row = { id: "c1", status: "challenge_sent", challenge_hash: ch.hash, challenge_expires_at: ch.expiresAt, attempts: 0 };
  assert.equal(checkChallenge(row, ch.code, now), "ok");
  assert.equal(checkChallenge(row, ch.code === "000000" ? "000001" : "000000", now), "wrong_code");
  assert.equal(checkChallenge(row, ch.code, now + CLAIM_TTL_MS + 1), "expired");
  assert.equal(checkChallenge({ ...row, attempts: CLAIM_MAX_ATTEMPTS }, ch.code, now), "too_many_attempts");
  assert.equal(checkChallenge({ ...row, status: "approved" }, ch.code, now), "not_pending");
  assert.equal(checkChallenge({ ...row, id: "c2" }, ch.code, now), "wrong_code"); // hash bound to claim id
});
