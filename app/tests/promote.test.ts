import { test } from "node:test";
import assert from "node:assert/strict";
import { promote } from "../src/lib/intel/promote";
const now = Date.parse("2026-11-04T00:00:00Z");
test("residential permits are never promoted", () => {
  assert.equal(promote({ external_id: "P1", record_type: "permit_signal", label: "project_signal", personal: false, checks: [], sources: [], fields: { permit_no: "P1", residential: true, zip: "76102" } } as any, now), null);
});
test("commercial permit -> prospect, never a hiring claim", () => {
  const p = promote({ external_id: "P2", record_type: "permit_signal", label: "project_signal", personal: false, checks: [], sources: [], fields: { permit_no: "P2", residential: false, permit_type: "Commercial", zip: "76102", status: "Issued", job_value: 50000 } } as any, now)!;
  assert.equal(p.listing_type, "buyer_prospect"); assert.match(p.summary, /not a hiring post/); assert.doesNotMatch(p.title, /hiring|job/i);
  assert.ok(!/outFields=\*/.test(p.source_url!));
});
test("award ending soon -> upcoming forecast (inferred); old award -> buyer prospect", () => {
  const base = { record_type: "buyer", label: "business_prospect", personal: false, checks: [], sources: [] } as any;
  const up = promote({ ...base, external_id: "b:1", fields: { buyer: "VA", award_id: "A1", end: "2027-06-01", naics: { code: "561720", description: "Janitorial Services" } } }, now)!;
  assert.equal(up.listing_type, "upcoming_forecast"); assert.equal(up.is_inferred, true); assert.equal(up.trade, "cleaning");
  const old = promote({ ...base, external_id: "b:2", fields: { buyer: "VA", award_id: "A2", end: "2025-01-01", naics: "236220" } }, now)!;
  assert.equal(old.listing_type, "buyer_prospect"); assert.equal(old.is_inferred, false);
});
