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

import { score as geoScore } from "../src/lib/matching";
const gc = { trades: ["commercial_construction"], zip_codes: ["76102"], license_status: "none", insurance_status: "none", accepts_leads: true, last_active_at: null, preferences: {} };
const gp = { trade: "commercial_construction", subtrades: [], zip: null, property_type: null };
test("no-zip prospect matches DFW contractor by trade", () => { assert.equal(geoScore(gp, gc).eligible, true); });
test("no-zip prospect rejects non-DFW non-statewide contractor", () => { assert.equal(geoScore(gp, { ...gc, zip_codes: ["78701"] }).eligible, false); });
test("no-zip prospect matches statewide contractor", () => { assert.equal(geoScore(gp, { ...gc, zip_codes: ["78701"], statewide: true }).eligible, true); });
import { cleanQ, cleanTrade, TAB_MAP } from "../src/lib/publicFeed";
test("public feed sanitizes PostgREST filter input", () => {
  assert.equal(cleanQ("roof),id.eq.1*"), "roof id eq 1"); assert.equal(cleanTrade("Commercial Construction"), "commercial_construction");
  assert.equal(TAB_MAP.upcoming, "future_contracts"); assert.equal(TAB_MAP.buyers, "find_buyers"); assert.equal(TAB_MAP.bogus, undefined);
});
