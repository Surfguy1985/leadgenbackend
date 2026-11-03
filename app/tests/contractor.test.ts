import { test } from "node:test";
import assert from "node:assert/strict";
import { ContractorOnboard } from "../src/lib/schemas";
const base = { business_name: "Acme Lawn", display_name: "Al", trades: ["landscaping"], zip_codes: ["75201"], accept_terms: true };
test("onboard validates", () => {
  assert.ok(ContractorOnboard.safeParse(base).success);
  assert.ok(ContractorOnboard.safeParse({ ...base, zip_codes: [], statewide: true }).success);
  assert.ok(!ContractorOnboard.safeParse({ ...base, zip_codes: [] }).success);
  assert.ok(!ContractorOnboard.safeParse({ ...base, accept_terms: false }).success);
  assert.ok(!ContractorOnboard.safeParse({ ...base, trades: ["hacking"] }).success);
  assert.ok(!("role" in (ContractorOnboard.safeParse({ ...base, role: "admin" }).data ?? {})));
});
