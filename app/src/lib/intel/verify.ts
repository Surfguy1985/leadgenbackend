import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPolicy } from "@/lib/fetcher";
import { entityKey, type Check } from "@/lib/quality";
import { DFW_CITY, franchiseLookup, type Candidate, type Ctx } from "./connectors";
import { evaluate } from "./evaluate";
import { threshold, resolveOrg } from "./engine";

/** Backlog verification: TDLR review records with no franchise-tax result yet -> Comptroller lookup -> re-score -> publish passers.
 *  Sequential with a pause between Socrata calls; each record retried at most every 14 days. Same rules as the TDLR connector (no guessing on ambiguous names). */
export async function verifyBacklog(db: SupabaseClient, opts: { max?: number; budgetMs?: number; pauseMs?: number } = {}) {
  const t0 = Date.now(); const out = { checked: 0, matched: 0, published: 0, still_review: 0, no_match: 0, orgs: 0 };
  const { data: src } = await db.from("sources").select("*").eq("connector", "tdlr").maybeSingle();
  const { data: ft } = await db.from("sources").select("id").eq("connector", "franchise_tax").maybeSingle();
  if (!src || !ft) return { skipped: "missing_source" };
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: recs } = await db.from("intel_records").select("id,external_id,fields,provenance,label,organization_id")
    .eq("source_id", src.id).eq("status", "review").eq("record_type", "contractor").eq("contains_personal_data", false)
    .is("fields->>taxpayer_number", null).or("fields->>active_status.is.null,fields->>active_status.neq.expired")
    .or(`fields->>verify_checked_at.is.null,fields->>verify_checked_at.lt.${cutoff}`).limit(opts.max ?? 300);
  const policy = await loadPolicy(ft.id);
  const ctx: Ctx = { sourceId: ft.id, policy, fetchedAt: new Date().toISOString(), limit: 1, lookups: {} };
  const lookup = franchiseLookup(ctx, opts.max ?? 300); const th = await threshold(db);
  for (const r of recs ?? []) {
    if (Date.now() - t0 > (opts.budgetMs ?? 270_000)) break;
    out.checked++; const f = { ...(r.fields as any) }; const prov = { ...(r.provenance as any) }; const now = new Date().toISOString(); f.verify_checked_at = now;
    const fr = await lookup(f.dba ?? f.legal_name, f.county).catch(() => null);
    await new Promise(x => setTimeout(x, opts.pauseMs ?? 250)); // Socrata courtesy pacing (no app token)
    if (!fr) { out.no_match++; await db.from("intel_records").update({ fields: f, updated_at: now }).eq("id", r.id); continue; }
    out.matched++; const p = { source: "tx_franchise_tax", fetched_at: now };
    Object.assign(f, { legal_name: fr.name, taxpayer_number: fr.taxpayer_number, active_status: fr.active ? "active" : "not_active" });
    for (const k of ["legal_name", "taxpayer_number", "active_status"]) prov[k] = p;
    if (!f.city && fr.city) { f.city = fr.city; prov.city = p; } if (!f.zip && fr.zip) { f.zip = fr.zip; prov.zip = p; }
    if (!f.location && (fr.zip ?? fr.city)) { f.location = fr.zip ?? fr.city; prov.location = p; }
    if (!f.business_contact && fr.address) { f.business_contact = "postal"; prov.business_contact = p; }
    f.entity_key = entityKey(f.legal_name, f.zip ?? f.city);
    const exp = f.license_expires; const checks: Check[] = [
      { name: "license_current", ok: exp ? Date.parse(exp) >= Date.now() : null, detail: exp ?? undefined }, { name: "franchise_tax_active", ok: fr.active },
      { name: "location_in_dfw", ok: f.city ? DFW_CITY.test(f.city) : null, detail: f.city ?? undefined }, ...(f.website ? [{ name: "website_names_business", ok: true }] : [])];
    const sources = ["tdlr", "tx_franchise_tax", ...(f.website ? ["business_website"] : [])];
    const c: Candidate = { external_id: r.external_id, record_type: "contractor", label: r.label, fields: f, checks, sources, personal: false, trade: f.trade };
    const e = evaluate(c, now, 1, th);
    await db.from("intel_records").update({ fields: f, provenance: prov, score: e.score, score_breakdown: e.breakdown, gate_failures: e.gates, status: e.status, fetched_at: now, updated_at: now }).eq("id", r.id);
    if (e.status === "published") out.published++; else out.still_review++;
    const id = await resolveOrg(db, src, c, e, e.status === "published"); if (id) { out.orgs++; if (!r.organization_id) await db.from("intel_records").update({ organization_id: id }).eq("id", r.id); }
  }
  return out;
}
