import type { SupabaseClient } from "@supabase/supabase-js";
import { fcScrape, fcSearch, firecrawlEnabled } from "./firecrawl";
import { DFW_CITY, type Candidate } from "./connectors";
import { evaluate } from "./evaluate";
import { threshold, resolveOrg } from "./engine";
import { entityKey, type Check } from "@/lib/quality";
import { isOwnSite, extractContact as extract } from "./contact";
const extractContact = (n: string, p: string, u: string) => extract(n, p, u, c => DFW_CITY.test(c));

/** Directory enrichment for TDLR records in review missing a city or contact. Budgeted; each record retried at most every 30 days. */
export async function enrichDirectory(db: SupabaseClient, opts: { max?: number; budgetMs?: number } = {}) {
  if (!firecrawlEnabled()) return { skipped: "FIRECRAWL_API_KEY missing" };
  const t0 = Date.now(); const out = { checked: 0, enriched: 0, published: 0, no_site: 0, errors: 0, error_sample: [] as string[] };
  const { data: src } = await db.from("sources").select("*").eq("connector", "tdlr").maybeSingle(); if (!src) return { skipped: "no_tdlr_source" };
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: recs } = await db.from("intel_records").select("id,external_id,fields,provenance,label,fetched_at,organization_id")
    .eq("source_id", src.id).eq("status", "review").eq("record_type", "contractor").eq("contains_personal_data", false)
    .or("fields->>city.is.null,fields->>business_contact.is.null").or(`fields->>enrich_checked_at.is.null,fields->>enrich_checked_at.lt.${cutoff}`)
    .order("score", { ascending: false }).limit(opts.max ?? 15);
  const th = await threshold(db);
  for (const r of recs ?? []) {
    if (Date.now() - t0 > (opts.budgetMs ?? 150_000)) break;
    out.checked++; const f = { ...(r.fields as any) }; const now = new Date().toISOString(); f.enrich_checked_at = now;
    try {
      const name = f.dba ?? f.legal_name;
      const hits = (await fcSearch(`"${name}" ${f.county ?? ""} County Texas ${f.subtrade ?? ""} contractor`, 6)).filter(h => isOwnSite(name, h.url));
      let got: ReturnType<typeof extractContact> = null; let pageUrl = "";
      for (const h of hits.slice(0, 2)) { const p = await fcScrape(h.url).catch(() => null); if (!p || p.status !== 200) continue; got = extractContact(name, p.markdown || p.html, h.url); if (got) { pageUrl = h.url; break; } }
      if (!got || (!got.phone && !got.city)) { out.no_site++; await db.from("intel_records").update({ fields: f, updated_at: now }).eq("id", r.id); continue; }
      const prov = { ...(r.provenance as any) }; const p = { source: "business_website", url: pageUrl, fetched_at: now };
      f.website = got.website; prov.website = p;
      if (got.phone) { f.business_phone = got.phone; prov.business_phone = p; if (!f.business_contact) { f.business_contact = "phone"; prov.business_contact = p; } }
      if (got.city && !f.city) { f.city = got.city; prov.city = p; if (!f.location) { f.location = got.city; prov.location = p; } }
      f.entity_key = entityKey(f.legal_name, f.zip ?? f.city);
      const exp = f.license_expires; const checks: Check[] = [
        { name: "license_current", ok: exp ? Date.parse(exp) >= Date.now() : null }, { name: "franchise_tax_active", ok: f.taxpayer_number ? f.active_status === "active" : null },
        { name: "location_in_dfw", ok: f.city ? DFW_CITY.test(f.city) : null }, { name: "website_names_business", ok: true, detail: got.website }];
      const sources = Array.from(new Set(["tdlr", ...(f.taxpayer_number ? ["tx_franchise_tax"] : []), "business_website"]));
      const c: Candidate = { external_id: r.external_id, record_type: "contractor", label: r.label, fields: f, checks, sources, personal: false, trade: f.trade, status: f.active_status === "expired" ? "expired" : null };
      const e = evaluate(c, now, 1, th); out.enriched++;
      await db.from("intel_records").update({ fields: f, provenance: prov, score: e.score, score_breakdown: e.breakdown, gate_failures: e.gates, status: e.status, fetched_at: now, updated_at: now }).eq("id", r.id);
      if (e.status === "published") { out.published++; const id = await resolveOrg(db, src, c, e, true); if (id && !r.organization_id) await db.from("intel_records").update({ organization_id: id }).eq("id", r.id); }
    } catch (e) { out.errors++; if (out.error_sample.length < 3) out.error_sample.push(String(e).slice(0, 120)); }
  }
  return out;
}
