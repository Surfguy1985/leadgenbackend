import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrl, isPrivateAddress, robotsAllows, hostAllowed } from "../src/lib/fetchPolicy";
const ok = { id: "s", enabled: true, emergency_paused: false, allowed_hostnames: ["txsmartbuy.gov"], canFetch: true };
test("deny by default: disabled / paused / no rights / empty allowlist", () => {
  assert.equal(checkUrl("https://txsmartbuy.gov/x", { ...ok, enabled: false }), "source_disabled");
  assert.equal(checkUrl("https://txsmartbuy.gov/x", { ...ok, emergency_paused: true }), "source_paused");
  assert.equal(checkUrl("https://txsmartbuy.gov/x", { ...ok, canFetch: false }), "rights_deny_fetch");
  assert.equal(checkUrl("https://txsmartbuy.gov/x", { ...ok, allowed_hostnames: [] }), "host_not_allowlisted");
});
test("url hygiene", () => {
  assert.equal(checkUrl("http://txsmartbuy.gov/x", ok), "https_only");
  assert.equal(checkUrl("https://u:p@txsmartbuy.gov/x", ok), "credentials_in_url");
  assert.equal(checkUrl("https://txsmartbuy.gov:8443/x", ok), "nonstandard_port");
  assert.equal(checkUrl("https://10.0.0.1/x", { ...ok, allowed_hostnames: ["10.0.0.1"] }), "ip_literal");
  assert.equal(checkUrl("https://evil-txsmartbuy.gov/x", ok), "host_not_allowlisted");
  assert.equal(checkUrl("https://txsmartbuy.gov.evil.com/x", ok), "host_not_allowlisted");
  assert.equal(checkUrl("https://www.txsmartbuy.gov/x", ok), null);
});
test("no social scraping even if allowlisted", () => {
  for (const h of ["facebook.com", "www.nextdoor.com", "x.com", "www.linkedin.com", "dallas.craigslist.org"])
    assert.equal(checkUrl(`https://${h}/p`, { ...ok, allowed_hostnames: [h.replace(/^www\.|^dallas\./, "")] }), "social_platform_blocked");
});
test("private address detection", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "198.18.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ["8.8.8.8", "151.101.1.1"]) assert.ok(!isPrivateAddress(ip), ip);
});
test("robots.txt", () => {
  const r = "User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: CrewforthatBot\nDisallow: /nobots\n";
  assert.ok(robotsAllows(r, "/private/x") === true, "specific UA group replaces *");
  assert.ok(!robotsAllows(r, "/nobots/a"));
  assert.ok(!robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/ok", "/private/x"));
  assert.ok(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/ok", "/private/ok/1"));
  assert.ok(!robotsAllows("User-agent: *\nDisallow: /", "/a"));
  assert.ok(robotsAllows("", "/a"));
  assert.ok(hostAllowed("A.TxSmartBuy.gov.", ["txsmartbuy.gov"]));
});
