import { test } from "node:test";
import assert from "node:assert/strict";
import { slotStatus, teaserLines, competitorLine, reminderEmail, pickVariant, unsubToken } from "../src/lib/monetization";
test("slots never negative; closed when full or zero", () => { assert.deepEqual(slotStatus(5, 7), { cap: 5, used: 7, remaining: 0, open: false }); assert.equal(slotStatus(0, 0).open, false); assert.equal(slotStatus(10, 3).remaining, 7); });
test("teasers hide zero counts", () => { assert.deepEqual(teaserLines({ bids30d: 0, privateLeads30d: 0, views30d: 0 }), []); assert.equal(teaserLines({ bids30d: 1, privateLeads30d: 0, views30d: 2, city: "Dallas", trade: "landscaping" }).length, 2); });
test("competitor line only when real and never names anyone", () => { assert.equal(competitorLine({ claimed: 0, paid: 0 }), null); assert.match(competitorLine({ claimed: 2, paid: 0, city: "Dallas" })!, /2 other/); });
test("reminder email refuses without postal address; includes unsubscribe + address", () => {
  assert.equal(reminderEmail({ businessName: "A", claimUrl: "u", unsubUrl: "x", postal: null, lines: [], step: 1 }), null);
  const m = reminderEmail({ businessName: "A<b>", claimUrl: "u", unsubUrl: "UNSUB", postal: "1 Main St, Dallas TX 75201", lines: [], step: 1 })!;
  assert.match(m.html, /UNSUB/); assert.match(m.html, /1 Main St/); assert.ok(!m.html.includes("A<b>"));
});
test("variant stable; token deterministic", () => { assert.equal(pickVariant("v1", 2), pickVariant("v1", 2)); assert.equal(unsubToken("A@x.com", "s"), unsubToken("a@x.com", "s")); });
