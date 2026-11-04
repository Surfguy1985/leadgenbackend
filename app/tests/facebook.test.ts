import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, rankBids, metaConfigured, postDailyDigest, type Bid } from "../src/lib/facebook";
const b = (id: string, deadline: string | null, budget: number | null = null): Bid => ({ id: `${id}0000000-0000`, title: `Bid ${id}`, trade: "landscaping", city: "Dallas", deadline, budget_max: budget });
test("rank drops past deadlines, soonest first", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const r = rankBids([b("a", "2026-12-01T00:00:00Z"), b("b", "2026-11-01T00:00:00Z"), b("c", "2026-11-10T00:00:00Z"), b("d", null, 9)], now);
  assert.deepEqual(r.map(x => x.title), ["Bid c", "Bid a", "Bid d"]);
});
test("digest caps at 5, links each bid, notes overflow, null when empty", () => {
  assert.equal(buildDigest([], "2026-11-03"), null);
  const d = buildDigest(Array.from({ length: 7 }, (_, i) => b(String(i), null)), "2026-11-03")!;
  assert.equal(d.ids.length, 5); assert.match(d.message, /\+2 more/); assert.match(d.message, /webflow\.io\/opportunities\/landscaping-/);
  assert.match(d.message, /aren't exclusive/);
});
test("disabled without env: no db or network touched", async () => {
  delete process.env.META_PAGE_ID; delete process.env.META_PAGE_ACCESS_TOKEN; assert.equal(metaConfigured(), false);
  const db = new Proxy({}, { get() { throw new Error("db touched"); } });
  assert.deepEqual(await postDailyDigest(db as never, { f: (() => { throw new Error("net"); }) as never }), { status: "not_configured" });
});
