import { test } from "node:test";
import assert from "node:assert/strict";
import { planForPrice, shouldApply, trialDaysFor, canRevealContact, payloadHash, normStatus } from "../src/lib/billing";
const plans = [{ code: "starter", stripe_price_id: "price_s", trial_days: 3, purchasable: true }, { code: "elite", stripe_price_id: "price_e", trial_days: 3, purchasable: true }];
test("price→plan from table; unknown price never grants", () => { assert.equal(planForPrice(plans, "price_e"), "elite"); assert.equal(planForPrice(plans, "price_x"), null); assert.equal(planForPrice(plans, null), null); });
test("out-of-order events ignored", () => { const t = "2026-11-03T12:00:00Z"; const s = Date.parse(t) / 1000; assert.equal(shouldApply(null, s), true); assert.equal(shouldApply(t, s - 5), false); assert.equal(shouldApply(t, s), false); assert.equal(shouldApply(t, s + 1), true); });
test("one trial per org", () => { assert.equal(trialDaysFor(plans[0], false), 3); assert.equal(trialDaysFor(plans[0], true), undefined); });
test("no contact reveal for trial/free", () => { assert.equal(canRevealContact("starter", "trialing"), false); assert.equal(canRevealContact("free", "active"), false); assert.equal(canRevealContact("starter", "active"), true); });
test("misc", () => { assert.equal(payloadHash("a").length, 64); assert.equal(normStatus("incomplete_expired"), "canceled"); });
