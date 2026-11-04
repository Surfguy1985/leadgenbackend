import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../src/lib/safeNext";
test("safeNext allows relative paths", () => {
  assert.equal(safeNext("/onboarding"), "/onboarding");
  assert.equal(safeNext("/dashboard?x=1#a"), "/dashboard?x=1#a");
});
test("safeNext rejects open redirects", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil", "", null, "/\tx", "/%0d"]) {
    const r = safeNext(bad as string | null);
    if (bad === "/%0d") assert.equal(r, "/%0d"); else assert.equal(r, null, String(bad));
  }
});
