import { safeFetch } from "@/lib/fetcher";
import type { SourcePolicy } from "@/lib/fetchPolicy";
import { classify, entityKey, type Check, type Label } from "@/lib/quality";

/** A normalised candidate from any connector. Only source fields; nothing invented. */
export type Candidate = {
  external_id: string; record_type: "job" | "contractor" | "buyer" | "permit_signal" | "hoa"; label: Label;
  fields: Record<string, unknown>; checks: Check[]; sources: string[]; status?: string | null; deadline?: string | null;
  trade?: string | null; valueUsd?: number | null; distanceMiles?: number | null; personal: boolean; conflicts?: string[];
};
export type Ctx = { sourceId: string; policy: SourcePolicy; fetchedAt: string; lookups: { franchise?: (name: string, county?: string) => Promise<FranchiseHit | null> } ; limit: number };
export type FranchiseHit = { taxpayer_number: string; name: string; city: string | null; zip: string | null; address: string | null; active: boolean; sourceId: string };

const DFW_COUNTIES = ["DALLAS", "TARRANT", "COLLIN", "DENTON"];
const COUNTY_CODE: Record<string, number> = { DALLAS: 57, TARRANT: 220, COLLIN: 43, DENTON: 61 };
const DFW_CITY = /^(DALLAS|FORT WORTH|ARLINGTON|PLANO|IRVING|GARLAND|FRISCO|MCKINNEY|GRAND PRAIRIE|DENTON|MESQUITE|CARROLLTON|RICHARDSON|LEWISVILLE|ALLEN|FLOWER MOUND|NORTH RICHLAND HILLS|MANSFIELD|EULESS|BEDFORD|GRAPEVINE|KELLER|COPPELL|ROWLETT|ROCKWALL|WYLIE|ADDISON|FARMERS BRANCH|HURST|COLLEYVILLE|SOUTHLAKE|THE COLONY|LITTLE ELM|PROSPER|CELINA|BURLESON|HALTOM CITY|WATAUGA|SACHSE|DUNCANVILLE|DESOTO|CEDAR HILL|LANCASTER|BALCH SPRINGS|HIGHLAND PARK|UNIVERSITY PARK|SAGINAW|AZLE|WHITE SETTLEMENT|BENBROOK|CROWLEY|FOREST HILL|KENNEDALE|RICHLAND HILLS|CORINTH|HIGHLAND VILLAGE|THE COLONY|MURPHY|PARKER|LUCAS|FAIRVIEW|ANNA|MELISSA|PRINCETON|SEAGOVILLE|HUTCHINS|WILMER|GLENN HEIGHTS|SUNNYVALE)$/i;
export const TDLR_TRADES: Record<string, { trade: string; sub: string }> = {
  "A/C Contractor": { trade: "residential_repair", sub: "hvac" }, "Electrical Contractor": { trade: "residential_repair", sub: "electrical" },
  "Electrical Sign Contractor": { trade: "commercial_construction", sub: "signage" }, "Elevator Contractor": { trade: "commercial_construction", sub: "elevator" },
};
const ENTITY = /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|CO|COMPANY|LTD|LP|PLLC|SERVICES?|MECHANICAL|ELECTRIC(AL)?|HEATING|AIR|SOLUTIONS|GROUP|ENTERPRISES?|CONTRACTORS?|SYSTEMS|ENERGY|HVAC)\b/i;

async function json(ctx: Ctx, url: string, init?: { post?: unknown }) {
  const r = await safeFetch(ctx.sourceId, url, { policy: ctx.policy, skipRobots: true, ...(init?.post ? { method: "POST" as const, jsonBody: init.post } : {}) }); // official APIs; robots governs crawlers of HTML pages
  if (r.status !== 200) throw new Error(`http_${r.status}`); return JSON.parse(r.body.toString("utf8"));
}
const soql = (base: string, q: Record<string, string>) => `${base}?${new URLSearchParams(q).toString()}`;
const mmddyyyy = (s?: string) => { const m = s?.match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };

/** TDLR: DFW contractor licences (business-type names only); cross-check against franchise tax for city/ZIP/active/entity id. */
export async function tdlr(ctx: Ctx, offset = 0): Promise<Candidate[]> {
  const where = `business_county in(${DFW_COUNTIES.map(c => `'${c}'`).join(",")}) AND license_type in(${Object.keys(TDLR_TRADES).map(t => `'${t}'`).join(",")})`;
  const rows: any[] = await json(ctx, soql("https://data.texas.gov/resource/7358-krk7.json", { $where: where, $order: "license_number", $limit: String(ctx.limit), $offset: String(offset) }));
  const out: Candidate[] = [];
  for (const r of rows) {
    const name = String(r.business_name ?? "").trim(); const t = TDLR_TRADES[r.license_type]; if (!name || !t) continue;
    const isEntity = ENTITY.test(name) && name.toUpperCase() !== String(r.owner_name ?? "").toUpperCase();
    const exp = mmddyyyy(r.license_expiration_date_mmddccyy); const expired = exp ? Date.parse(exp) < Date.now() : false;
    const fr = isEntity && ctx.lookups.franchise ? await ctx.lookups.franchise(name, r.business_county) : null;
    const city = fr?.city ?? null; const checks: Check[] = [
      { name: "license_current", ok: exp ? !expired : null, detail: exp ?? undefined },
      { name: "franchise_tax_active", ok: fr ? fr.active : null },
      { name: "location_in_dfw", ok: city ? DFW_CITY.test(city) : null, detail: city ?? undefined },
    ];
    out.push({
      external_id: `${r.license_type}:${r.license_number}`, record_type: "contractor", label: classify("license"), personal: !isEntity,
      fields: { legal_name: fr?.name ?? name, dba: name, trade: t.trade, subtrade: t.sub, license_type: r.license_type, license_number: r.license_number,
        license_or_entity_id: r.license_number, license_expires: exp, county: r.business_county, location: fr?.zip ?? city ?? null, city, zip: fr?.zip ?? null,
        active_status: expired ? "expired" : fr?.active ? "active" : fr ? "not_active" : null, taxpayer_number: fr?.taxpayer_number ?? null,
        business_contact: fr?.address ? "postal" : r.business_telephone ? "phone" : null, entity_key: entityKey(fr?.name ?? name, fr?.zip ?? city) },
      checks, sources: fr ? ["tdlr", "tx_franchise_tax"] : ["tdlr"], status: expired ? "expired" : null, trade: t.trade,
      conflicts: fr && fr.city && r.business_county && COUNTY_CODE[r.business_county] === undefined ? ["county_unknown"] : [],
    });
  }
  return out;
}

/** Franchise tax lookup (verification only). Prefix match on normalised name within DFW county codes; requires right-to-transact 'A'. */
export function franchiseLookup(ctx: Ctx): (name: string, county?: string) => Promise<FranchiseHit | null> {
  let budget = 60; // per run; the rest stay "unchecked" and are retried next run
  return async (name, county) => {
    if (budget-- <= 0) return null;
    const base = entityKey(name, "").split("|")[0].replace(/'/g, "''"); if (base.length < 4) return null;
    const codes = county && COUNTY_CODE[county] ? [COUNTY_CODE[county]] : Object.values(COUNTY_CODE);
    const rows: any[] = await json(ctx, soql("https://data.texas.gov/resource/9cir-efmm.json", { $select: "taxpayer_number,taxpayer_name,taxpayer_city,taxpayer_zip,taxpayer_address,right_to_transact_business_code", $where: `upper(taxpayer_name) like '${base}%' AND taxpayer_county_code in(${codes.join(",")})`, $limit: "5" })).catch(() => []);
    if (rows.length !== 1 && !rows.some(x => entityKey(x.taxpayer_name, "") === entityKey(name, ""))) return null; // ambiguous -> no match (no guessing)
    const x = rows.find(x => entityKey(x.taxpayer_name, "") === entityKey(name, "")) ?? rows[0];
    return { taxpayer_number: x.taxpayer_number, name: x.taxpayer_name, city: x.taxpayer_city ?? null, zip: (x.taxpayer_zip ?? "").slice(0, 5) || null, address: x.taxpayer_address ?? null, active: x.right_to_transact_business_code === "A", sourceId: ctx.sourceId };
  };
}

/** Fort Worth issued permits -> project signals. Owner names are never read; residential keeps ZIP + type only. */
export async function fwPermits(ctx: Ctx): Promise<Candidate[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const q = { where: `Status_Date >= DATE '${since}'`, outFields: "Permit_No,Permit_Type,Permit_SubType,Permit_Category,B1_WORK_DESC,Address,Zip_Code,Current_Status,Status_Date,JobValue,Use_Type,Specific_Use", resultRecordCount: String(Math.min(ctx.limit, 1000)), orderByFields: "Status_Date DESC", f: "json" };
  const d: any = await json(ctx, `https://mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Permits/FeatureServer/0/query?${new URLSearchParams(q)}`);
  return (d.features ?? []).map((f: any) => { const a = f.attributes; const residential = /resid/i.test(`${a.Permit_Category} ${a.Use_Type}`);
    return { external_id: String(a.Permit_No), record_type: "permit_signal", label: classify("permit"), personal: false,
      fields: { permit_no: a.Permit_No, permit_type: a.Permit_Type, subtype: a.Permit_SubType, category: a.Permit_Category, work: residential ? null : a.B1_WORK_DESC, address: residential ? null : a.Address, zip: a.Zip_Code, city: "Fort Worth", status: a.Current_Status, status_date: a.Status_Date ? new Date(a.Status_Date).toISOString() : null, job_value: a.JobValue ?? null, use: a.Use_Type, residential },
      checks: [{ name: "status_issued", ok: /issued|final/i.test(a.Current_Status ?? "") }], sources: ["fw_permits"], status: a.Current_Status, valueUsd: a.JobValue ?? null } as Candidate; });
}

/** USAspending: recent contract awards performed in DFW counties for construction/services NAICS -> buyer prospects + awardee contractors. */
export async function usaspending(ctx: Ctx): Promise<Candidate[]> {
  const end = new Date().toISOString().slice(0, 10); const start = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const body = { filters: { time_period: [{ start_date: start, end_date: end }], award_type_codes: ["A", "B", "C", "D"], naics_codes: { require: ["23", "5617"] },
    place_of_performance_locations: ["113", "439", "085", "121"].map(county => ({ country: "USA", state: "TX", county })) },
    fields: ["Award ID", "Recipient Name", "Recipient UEI", "Award Amount", "Awarding Agency", "Awarding Sub Agency", "Start Date", "End Date", "NAICS", "Place of Performance City Code", "generated_internal_id"],
    limit: Math.min(ctx.limit, 100), page: 1, sort: "Start Date", order: "desc" };
  const d: any = await json(ctx, "https://api.usaspending.gov/api/v2/search/spending_by_award/", { post: body });
  const out: Candidate[] = [];
  for (const a of d.results ?? []) {
    const url = `https://www.usaspending.gov/award/${a.generated_internal_id}`;
    out.push({ external_id: `buyer:${a["Awarding Sub Agency"] ?? a["Awarding Agency"]}:${a["Award ID"]}`, record_type: "buyer", label: classify("award"), personal: false,
      fields: { buyer: a["Awarding Sub Agency"] ?? a["Awarding Agency"], agency: a["Awarding Agency"], award_id: a["Award ID"], amount: a["Award Amount"], naics: a.NAICS?.code ?? a.NAICS ?? null, start: a["Start Date"], end: a["End Date"], official_url: url, awardee: a["Recipient Name"] },
      checks: [], sources: ["usaspending"], valueUsd: a["Award Amount"] ?? null });
    if (a["Recipient Name"]) out.push({ external_id: `awardee:${a["Recipient UEI"] ?? a["Recipient Name"]}`, record_type: "contractor", label: classify("license"), personal: false,
      fields: { legal_name: a["Recipient Name"], uei: a["Recipient UEI"] ?? null, license_or_entity_id: a["Recipient UEI"] ?? null, last_award: a["Award ID"], last_award_amount: a["Award Amount"], official_url: url, entity_key: entityKey(a["Recipient Name"], null), trade: null, location: null, active_status: null, business_contact: null },
      checks: [], sources: ["usaspending"] });
  }
  return out;
}
export const CONNECTORS = { tdlr, fw_permits: fwPermits, usaspending } as const;
