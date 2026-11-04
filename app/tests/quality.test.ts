import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreRecord, decide, groundFields, entityKey, classify, LABEL_TEXT } from "../src/lib/quality";
const now = Date.parse("2026-11-03T12:00:00Z");
const fullContractor = { legal_name: "ACME AIR LLC", trade: "hvac", location: "75201", license_or_entity_id: "TACLA123", active_status: "active", business_contact: "acmeair.com" };
test("well-verified contractor passes 80 and publishes", () => {
  const s = scoreRecord({ type: "contractor", fields: fullContractor, checks: [{ name: "franchise_tax_active", ok: true }, { name: "geocode_in_city", ok: true }], sourcesAgreeing: 2, fetchedAt: "2026-11-03T00:00:00Z", trustTier: 1, trade: "hvac", distanceMiles: 5 }, now);
  assert.ok(s.score >= 80, String(s.score)); assert.deepEqual(s.gates, []); assert.equal(decide(s), "published");
});
test("single-source contractor stays in review", () => {
  const s = scoreRecord({ type: "contractor", fields: fullContractor, checks: [], sourcesAgreeing: 1, fetchedAt: "2026-11-03T00:00:00Z", trustTier: 1, trade: "hvac" }, now);
  assert.equal(decide(s), "review");
});
test("hard gates block even a high score", () => {
  const s = scoreRecord({ type: "job", fields: { title: "Mowing", buyer: "City", location: "76102", trade: "landscaping", deadline: "2026-11-01", official_url: "https://x" }, checks: [{ name: "url_resolves", ok: false, detail: "404" }], sourcesAgreeing: 2, fetchedAt: "2026-11-03T00:00:00Z", trustTier: 1, deadline: "2026-11-01", trade: "landscaping" }, now);
  assert.ok(s.gates.includes("expired:deadline_passed")); assert.ok(s.gates.some(g => g.startsWith("failed:url_resolves"))); assert.equal(decide(s), "review");
  const m = scoreRecord({ type: "contractor", fields: { ...fullContractor, business_contact: "" }, checks: [], sourcesAgreeing: 2, fetchedAt: "2026-11-03T00:00:00Z", trustTier: 1, status: "Forfeited" }, now);
  assert.ok(m.gates.includes("missing:business_contact")); assert.ok(m.gates.includes("status:forfeited"));
});
test("conflicts gate", () => { const s = scoreRecord({ type: "contractor", fields: fullContractor, checks: [], sourcesAgreeing: 3, fetchedAt: "2026-11-03T00:00:00Z", trustTier: 1, conflicts: ["city_mismatch"] }, now); assert.ok(s.gates.includes("conflict:city_mismatch")); });
test("grounding drops invented values and keeps provenance", () => {
  const g = groundFields({ title: "Parking lot sweeping", value: 48000, buyer: "Made Up Agency" }, "Solicitation: PARKING LOT  SWEEPING. Est. value $48,000.", { source: "esbd", fetched_at: "t" });
  assert.deepEqual(Object.keys(g.fields).sort(), ["title", "value"]); assert.deepEqual(g.dropped, ["buyer"]); assert.equal(g.provenance.title.source, "esbd");
});
test("entity key dedupes suffixes/punctuation", () => { assert.equal(entityKey("Acme Air, L.L.C.", "75201-1234"), entityKey("ACME AIR LLC", "75201")); });
test("permits are never hiring", () => { assert.equal(classify("permit"), "project_signal"); assert.ok(!/hiring/i.test(LABEL_TEXT.project_signal.replace("not a hiring post", ""))); assert.equal(classify("award"), "business_prospect"); });
