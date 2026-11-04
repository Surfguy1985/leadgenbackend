import type { Candidate } from "./connectors";

/** Published intel -> public opportunity rows. Only real source fields; prospects/project signals are never labelled as jobs.
 *  - USAspending award  -> 'upcoming_forecast' (contract ends within 18 months: possible recompete, is_inferred) or 'buyer_prospect'
 *  - Fort Worth permit  -> 'buyer_prospect' project signal, NON-residential only (residential permits never leave intel_records) */
export type PromotedOpp = {
  source_record_id: string; kind: "discovery_signal" | "public_bid"; listing_type: "upcoming_forecast" | "buyer_prospect" | "public_bid"; title: string; summary: string;
  trade: string; city: string | null; zip: string | null; geographic_scope: "zip" | "city" | "metro"; source_url: string | null; official_apply_url: string | null;
  deadline: string | null; hide_after: string | null; is_inferred: boolean; intel_label: string; budget_min: number | null; budget_max: number | null;
};
const usd = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : null;
export function naicsTrade(naics: unknown): string {
  const code = String((naics as any)?.code ?? naics ?? "");
  if (code.startsWith("561730")) return "landscaping";
  if (code.startsWith("5617")) return "cleaning";
  if (code.startsWith("2361")) return "residential_repair";
  return "commercial_construction";
}
export function permitTrade(f: Record<string, any>): string {
  const t = `${f.permit_type ?? ""} ${f.subtype ?? ""} ${f.work ?? ""}`;
  if (/irrigat|landscap/i.test(t)) return "landscaping";
  if (/apartment|multi.?family/i.test(`${t} ${f.use ?? ""}`)) return "multifamily";
  return "commercial_construction";
}
const day = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

export function promote(c: Candidate, now = Date.now()): PromotedOpp | null {
  const f = c.fields as Record<string, any>;
  if (c.record_type === "buyer") {
    if (!f.buyer || !f.award_id) return null;
    const end = day(f.end); const endMs = end ? Date.parse(end) : NaN;
    const upcoming = Number.isFinite(endMs) && endMs > now && endMs - now <= 548 * 86_400_000;
    const naicsDesc = (f.naics as any)?.description ?? null; const amount = usd(f.amount);
    const what = naicsDesc ? String(naicsDesc).toLowerCase() : "construction/services";
    return {
      source_record_id: `usaspending:${c.external_id}`, kind: "discovery_signal", listing_type: upcoming ? "upcoming_forecast" : "buyer_prospect",
      title: upcoming ? `${f.buyer}: ${what} contract ends ${end} (possible recompete)` : `${f.buyer} buys ${what} in DFW`,
      summary: [`Federal award ${f.award_id}${amount ? ` (${amount})` : ""} for ${what}, performed in Dallas, Tarrant, Collin or Denton County.`,
        f.start || end ? `Period: ${day(f.start) ?? "?"} to ${end ?? "?"}.` : "", f.awardee ? `Current awardee: ${f.awardee}.` : "",
        upcoming ? "A recompete is possible but not announced; this is a forecast, not an open bid." : "Prospect for outreach; not a job posting."].filter(Boolean).join(" "),
      trade: naicsTrade(f.naics), city: null, zip: null, geographic_scope: "metro", source_url: f.official_url ?? null, official_apply_url: null,
      deadline: null, hide_after: upcoming ? new Date(endMs).toISOString() : new Date(now + 180 * 86_400_000).toISOString(), is_inferred: upcoming,
      intel_label: c.label, budget_min: null, budget_max: null,
    };
  }
  if (c.record_type === "job") {
    if (!f.title || !f.official_url || !f.deadline || c.label !== "active_job") return null;
    return { source_record_id: c.external_id, kind: "public_bid", listing_type: "public_bid", title: String(f.title).slice(0, 300),
      summary: [f.bid_number ? `Bid ${f.bid_number}` : null, `Agency: ${f.buyer}`, f.category ? `Category: ${f.category}` : null, f.closes_raw ? `Closes ${f.closes_raw} (Central)` : null, f.description ? String(f.description).slice(0, 600) : null].filter(Boolean).join(" · "),
      trade: String(f.trade), city: f.city ?? null, zip: null, geographic_scope: "city", source_url: f.official_url, official_apply_url: f.official_url,
      deadline: new Date(f.deadline).toISOString(), hide_after: new Date(f.deadline).toISOString(), is_inferred: false, intel_label: c.label, budget_min: null, budget_max: null };
  }
  if (c.record_type === "permit_signal") {
    if (f.residential || !f.permit_no) return null; // residential: never public (homeowner proximity)
    const zip = typeof f.zip === "string" && /^\d{5}/.test(f.zip) ? f.zip.slice(0, 5) : typeof f.zip === "number" ? String(f.zip).padStart(5, "0").slice(0, 5) : null;
    const type = [f.permit_type, f.subtype].filter(Boolean).join(" – ") || "Building";
    const value = usd(f.job_value);
    const issued = day(f.status_date);
    const q = new URLSearchParams({ where: `Permit_No='${String(f.permit_no).replace(/'/g, "''")}'`, outFields: "Permit_No,Permit_Type,Permit_SubType,B1_WORK_DESC,Address,Zip_Code,Current_Status,Status_Date,JobValue", f: "html" });
    return {
      source_record_id: `fw_permits:${f.permit_no}`, kind: "discovery_signal", listing_type: "buyer_prospect",
      title: `Project activity: ${type} permit ${String(f.status ?? "issued").toLowerCase()} in Fort Worth${zip ? ` ${zip}` : ""}`,
      summary: [f.work ? String(f.work).slice(0, 400) : null, f.address ? `Site: ${f.address}.` : null, value ? `Declared job value ${value}.` : null,
        issued ? `Status date ${issued}.` : null, "Permit activity only; not a hiring post. The permit holder may need subcontractors or services."].filter(Boolean).join(" "),
      trade: permitTrade(f), city: "Fort Worth", zip, geographic_scope: zip ? "zip" : "city",
      source_url: `https://mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Permits/FeatureServer/0/query?${q}`, official_apply_url: null,
      deadline: null, hide_after: new Date((issued ? Date.parse(issued) : now) + 90 * 86_400_000).toISOString(), is_inferred: false,
      intel_label: c.label, budget_min: null, budget_max: null,
    };
  }
  return null;
}
