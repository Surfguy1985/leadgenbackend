import { test } from "node:test";
import assert from "node:assert/strict";
import { runStep, backoffMinutes, type StepStore } from "../src/lib/steps";
import { pickMatches, type Candidate } from "../src/lib/matching";

const memStore = (): StepStore & { log: string[] } => {
  const done = new Set<string>(); const log: string[] = [];
  return { log, async isDone(k) { return done.has(k); }, async markDone(k) { done.add(k); log.push(k); } };
};

test("runStep is idempotent and records completion once", async () => {
  const s = memStore(); let calls = 0;
  const a = await runStep(s, "wf01:x:classify", async () => { calls++; return { result: "ok" }; });
  const b = await runStep(s, "wf01:x:classify", async () => { calls++; return { result: "ok" }; });
  assert.equal(calls, 1); assert.equal(a.skipped, false); assert.equal(b.skipped, true); assert.deepEqual(s.log, ["wf01:x:classify"]);
});
test("runStep failure is not marked done (so it retries)", async () => {
  const s = memStore();
  await assert.rejects(runStep(s, "k", async () => { throw new Error("boom"); }));
  assert.equal(await s.isDone("k"), false);
});
test("backoff 1,2,4,8,16 then dead-letter", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(backoffMinutes), [1, 2, 4, 8, 16, null]);
});

const base: Omit<Candidate, "id"> = { trades: ["cleaning"], zip_codes: ["75201"], license_status: "unverified", insurance_status: "verified", accepts_leads: true, last_active_at: null, preferences: {}, owner_user_id: "u", paid: true, alerts_left: 3 };
const opp = { kind: "private_lead" as const, trade: "cleaning", subtrades: [], zip: "75201", property_type: null };
test("pickMatches: private leads need paid plan, alert budget, owner", () => {
  const cs: Candidate[] = [
    { ...base, id: "paid" }, { ...base, id: "free", paid: false }, { ...base, id: "noBudget", alerts_left: 0 }, { ...base, id: "noOwner", owner_user_id: null },
  ];
  assert.deepEqual(pickMatches(opp, cs).picks.map(p => p.contractor_id), ["paid"]);
  assert.equal(pickMatches({ ...opp, kind: "public_bid" }, cs).picks.length, 2);
});
test("pickMatches caps private leads at 5", () => {
  const cs = Array.from({ length: 8 }, (_, i) => ({ ...base, id: `c${i}` }));
  const r = pickMatches(opp, cs); assert.equal(r.picks.length, 5); assert.equal(r.underMinTarget, false);
});
