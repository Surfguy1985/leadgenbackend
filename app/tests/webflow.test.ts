import { test } from "node:test";
import assert from "node:assert/strict";
import { oppFields, orgFields, tabFor, isDirectoryPublic } from "../src/lib/webflowMap";
test("tabs", () => { assert.equal(tabFor("public_bid", "public_bid"), "jobs_now"); assert.equal(tabFor("upcoming_forecast", "discovery_signal"), "upcoming"); assert.equal(tabFor("buyer_prospect", "discovery_signal"), "buyers"); assert.equal(tabFor(null, "discovery_signal"), "upcoming"); });
test("opp fields whitelist (no contacts)", () => {
  const f = oppFields({ id: "12345678-aaaa", kind: "public_bid", listing_type: "public_bid", title: "Janitorial", trade: "Cleaning & Janitorial", geographic_scope: "statewide", official_apply_url: "https://x.gov/a", ...({ email: "a@b.co", phone: "1" } as object) } as never);
  assert.equal(f.tab, "jobs_now"); assert.equal(f.slug, "cleaning-janitorial-12345678"); assert.equal(f["geographic-scope"], "statewide");
  assert.ok(!JSON.stringify(f).includes("a@b.co"));
});
test("directory visibility", () => {
  assert.ok(isDirectoryPublic({ is_directory_listed: true, source_id: null, public_profile_optin: true }, false));
  assert.ok(!isDirectoryPublic({ is_directory_listed: true, source_id: null, public_profile_optin: false }, true));
  assert.ok(!isDirectoryPublic({ is_directory_listed: true, source_id: "s", public_profile_optin: true }, false));
  assert.ok(!isDirectoryPublic({ is_directory_listed: false, source_id: null, public_profile_optin: true }, true));
  assert.equal(orgFields({ id: "abcdef12", business_name: "Acme HOA", kind: "hoa", claim_status: "unclaimed" }).slug, "acme-hoa-abcdef");
});
