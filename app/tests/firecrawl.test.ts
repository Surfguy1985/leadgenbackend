import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { listBidIds, parseBid, parseClose, bidTrade } from "../src/lib/intel/civicplus";
import { extractContact as ec, isOwnSite } from "../src/lib/intel/contact";
const extractContact = (n: string, p: string, u: string) => ec(n, p, u, c => /^(FRISCO|PLANO)$/i.test(c));
import { promote } from "../src/lib/intel/promote";
import { evaluate } from "../src/lib/intel/evaluate";
const html = `<a href="bids.aspx?bidID=204">x</a><a href="Bids.aspx?bidID=205">y</a><table><tr><td><span>Bid Number:</span></td><td><span>2026-40-10-07</span></td></tr><tr><td>Bid Title:</td><td>Westside Sanitary Sewer Interceptor Project 1</td></tr><tr><td>Category:</td><td>Public Works</td></tr><tr><td>Status:</td><td>Open</td></tr><tr><td>Publication Date/Time:</td><td>10/21/2026 8:00 AM</td></tr><tr><td>Closing Date/Time:</td><td>11/18/2026 10:00 AM</td></tr><tr><td>Contact Person:</td><td>Jane Doe</td></tr></table>`;
test("civicplus parse is deterministic and never keeps contact persons", () => {
  assert.deepEqual(listBidIds(html), [204, 205]);
  const b = parseBid(html);
  assert.equal(b.bid_number, "2026-40-10-07"); assert.equal(b.title, "Westside Sanitary Sewer Interceptor Project 1"); assert.equal(b.status, "Open");
  assert.equal(parseClose(b.closes), "2026-11-18T10:00:00-06:00"); assert.equal(bidTrade(b), "commercial_construction");
  assert.ok(!JSON.stringify(b).includes("Jane"));
  assert.equal(bidTrade({ title: "Laptop computers", category: "IT", description: null }), null);
});
test("open bid with all required fields publishes as public_bid", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const f = { title: "Sewer", buyer: "City of Mansfield", location: "Mansfield", city: "Mansfield", trade: "commercial_construction", deadline: "2026-11-18T10:00:00-06:00", official_url: "https://www.mansfieldtexas.gov/Bids.aspx?bidID=204", bid_number: "1" };
  const c = { external_id: "civicplus:x:204", record_type: "job" as const, label: "active_job" as const, fields: f, checks: [{ name: "source_url_resolves", ok: true }, { name: "status_open", ok: true }], sources: ["civicplus_bids"], personal: false, trade: f.trade, deadline: f.deadline, status: "open" };
  const e = evaluate(c, new Date().toISOString(), 1, 80); assert.equal(e.status, "published");
  assert.equal(promote(c, now)?.listing_type, "public_bid");
  const bad = evaluate({ ...c, checks: [{ name: "source_url_resolves", ok: false }] }, new Date().toISOString(), 1, 80); assert.equal(bad.status, "review");
});
test("enrichment keeps only verbatim values and requires the business name", () => {
  const page = "Welcome to Acme Mechanical LLC. Call (972) 555-0142. Proudly serving Frisco, TX and Plano, Texas.";
  const r = extractContact("ACME MECHANICAL LLC", page, "https://acmemech.com/about");
  assert.equal(r?.phone, "(972) 555-0142"); assert.equal(r?.city, "Frisco"); assert.equal(r?.website, "https://acmemech.com");
  assert.equal(extractContact("BOLT ELECTRIC INC", page, "https://acmemech.com"), null);
});
test("own-website rule rejects directories, aggregators and documents", () => {
  assert.equal(isOwnSite("D.T.M. HEATING AND AIR CONDITIONING", "https://dtmpro.com/furnace-repair/"), true);
  assert.equal(isOwnSite("TREMAINE HEATING & COOLING LLC", "https://dfwhvaccontractors.com/tarrant-county-tx/page/12/"), false);
  assert.equal(isOwnSite("RED'S AIR CONDITIONING & HEATING", "https://serviceagent.ai/directory/texas/garland/hvac/x/"), false);
  assert.equal(isOwnSite("WOODLANDER ENVIRONMENTS,INC", "https://cases.stretto.com/a.pdf"), false);
  assert.equal(isOwnSite("LG HEAT & AIR LLC", "https://www.verifiednode.com/audit/texas/dallas/lg-heat-and-air-llc"), false);
  assert.equal(isOwnSite("TREMAINE HEATING & COOLING LLC", "https://tremaineheating.com/"), true);
  assert.equal(isOwnSite("ACME MECHANICAL LLC", "https://www.facebook.com/acme"), false);
});
