import { test } from "node:test";
import assert from "node:assert/strict";
import { newCode, normCode, referralLink, isConversion, stats } from "../src/lib/referrals";
test("codes are url-safe, unambiguous, fixed length", () => {
  for (let i = 0; i < 200; i++) { const c = newCode(); assert.match(c, /^[a-hj-km-np-z2-9]{8}$/); }
});
test("normCode rejects junk and normalizes case", () => {
  assert.equal(normCode(" AbCd2345 "), "abcd2345");
  for (const bad of ["", "abc", "../etc", "abcd 234", "a".repeat(13), "<script>", null, 7]) assert.equal(normCode(bad), null);
});
test("referral link", () => assert.equal(referralLink("https://x.app/", "abcd2345"), "https://x.app/r/abcd2345"));
test("only active paid plans convert (not trials, not free)", () => {
  assert.equal(isConversion("starter", "active"), true);
  assert.equal(isConversion("starter", "trialing"), false);
  assert.equal(isConversion("free", "active"), false);
});
test("stats", () => assert.deepEqual(stats([{ status: "signed_up", reward_status: "none" }, { status: "converted", reward_status: "pending_review" }, { status: "void", reward_status: "none" }]), { signups: 2, converted: 1, rewardsPending: 1 }));
