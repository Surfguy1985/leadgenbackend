import { test } from "node:test";
import assert from "node:assert/strict";
import { mapNotice, samQuery, tradeForNaics } from "../src/lib/connectors/samgovMap";
const now = new Date("2026-11-03T12:00:00Z");
const n = { noticeId: "abc123", title: "Janitorial Services - Fort Worth VA", type: "Solicitation", naicsCode: "561720", active: "Yes", responseDeadLine: "2026-11-20T17:00:00-06:00", fullParentPathName: "VETERANS AFFAIRS, DEPARTMENT OF.VA NETWORK 17", placeOfPerformance: { city: { name: "Fort Worth" }, state: { code: "TX" }, zip: "76104-1234" }, uiLink: "https://sam.gov/opp/abc123/view" };
test("maps TX janitorial solicitation", () => { const m = mapNotice(n, now)!; assert.equal(m.trade, "cleaning"); assert.equal(m.zip, "76104"); assert.equal(m.hide_after, "2026-11-20T23:00:00.000Z"); assert.equal(m.organization_ref, "VETERANS AFFAIRS, DEPARTMENT OF"); assert.equal(m.official_apply_url, n.uiLink); });
test("filters out of scope", () => {
  assert.equal(mapNotice({ ...n, placeOfPerformance: { state: { code: "OK" } } }, now), null);
  assert.equal(mapNotice({ ...n, naicsCode: "541511" }, now), null);
  assert.equal(mapNotice({ ...n, type: "Award Notice" }, now), null);
  assert.equal(mapNotice({ ...n, active: "No" }, now), null);
  assert.equal(mapNotice({ ...n, responseDeadLine: "2026-10-01T00:00:00Z" }, now), null);
  assert.ok(mapNotice({ ...n, uiLink: "https://evil.com/x" }, now)!.official_apply_url.startsWith("https://sam.gov/opp/"));
});
test("naics + query", () => { assert.equal(tradeForNaics("238220"), "commercial_construction"); assert.equal(tradeForNaics("561730"), "landscaping"); const q = samQuery(new Date("2026-11-01T00:00:00Z"), now); assert.equal(q.get("state"), "TX"); assert.equal(q.get("postedFrom"), "11/01/2026"); assert.ok(!q.has("api_key")); });
