import { test } from "node:test";
import assert from "node:assert/strict";
import { isDue, evaluate } from "../src/lib/intel/evaluate";
const now = Date.parse("2026-11-03T12:00:00Z");
test("schedules", () => { assert.equal(isDue("daily", null, now), true); assert.equal(isDue("daily", "2026-11-03T06:00:00Z", now), false); assert.equal(isDue("6h", "2026-11-03T05:00:00Z", now), true); assert.equal(isDue("manual", null, now), false); });
test("sole-proprietor names never publish; permits are signals", () => {
  const f = { legal_name: "LOPEZ, JUAN", trade: "residential_repair", location: "75201", license_or_entity_id: "1", active_status: "active", business_contact: "postal" };
  const e = evaluate({ external_id: "x", record_type: "contractor", label: "contractor_profile", fields: f, checks: [{ name: "a", ok: true }], sources: ["tdlr", "tx_franchise_tax"], personal: true, trade: "residential_repair" }, new Date(now).toISOString(), 1, 80);
  assert.equal(e.status, "review"); assert.ok(e.gates.includes("personal_name:not_an_entity"));
  const p = evaluate({ external_id: "p", record_type: "permit_signal", label: "project_signal", fields: {}, checks: [{ name: "status_issued", ok: false }], sources: ["fw_permits"], personal: false }, new Date(now).toISOString(), 1, 80);
  assert.equal(p.status, "review");
});
