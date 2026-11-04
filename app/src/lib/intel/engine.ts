import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPolicy, withIngestionRun } from "@/lib/fetcher";
import { evaluate, isDue } from "./evaluate";
export { evaluate, isDue };
import { promote } from "./promote";
import { CONNECTORS, franchiseLookup, type Candidate, type Ctx } from "./connectors";

export async function threshold(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("value").eq("key", "quality_threshold").maybeSingle();
  const n = Number((data?.value as any)?.publish); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 80;
}

/** Run one source end-to-end. Dry-run (sources.dry_run) fetches + scores and returns counts; writes nothing. */
export async function runSource(db: SupabaseClient, src: any, opts: { force?: boolean; limit?: number } = {}) {
  if (src.rights_decision !== "approved") return { source: src.name, skipped: `rights_${src.rights_decision}` };
  if (!src.enabled || src.emergency_paused) return { source: src.name, skipped: "disabled_or_paused" };
  if (!opts.force && !isDue(src.refresh_schedule, src.last_attempt_at)) return { source: src.name, skipped: "not_due" };
  const fn = (CONNECTORS as Record<string, (ctx: Ctx, ...a: any[]) => Promise<Candidate[]>>)[src.connector]; if (!fn) return { source: src.name, skipped: "no_connector" };
  await db.from("sources").update({ last_attempt_at: new Date().toISOString() }).eq("id", src.id);
  const th = await threshold(db); const fetchedAt = new Date().toISOString();
  const { data: ft } = await db.from("sources").select("id").eq("connector", "franchise_tax").eq("enabled", true).maybeSingle();
  const tally = { fetched: 0, published: 0, review: 0, orgs_upserted: 0, opps_upserted: 0, dry_run: !!src.dry_run, gates: {} as Record<string, number>, buckets: [0, 0, 0, 0, 0] };
  const run = await withIngestionRun(src.id, async () => {
    const policy = await loadPolicy(src.id);
    const ctx: Ctx = { sourceId: src.id, policy, fetchedAt, limit: opts.limit ?? 2000, lookups: {}, source: { base_url: src.base_url, data_owner: src.data_owner, name: src.name } };
    if (ft) { const fp = await loadPolicy(ft.id); ctx.lookups.franchise = franchiseLookup({ ...ctx, sourceId: ft.id, policy: fp }); }
    const { count: seen } = await db.from("intel_records").select("id", { count: "exact", head: true }).eq("source_id", src.id);
    const cands = await fn(ctx, src.connector === "tdlr" ? (seen ?? 0) % 7000 : 0);
    tally.fetched = cands.length;
    for (const c of cands) {
      const e = evaluate(c, fetchedAt, src.trust_tier ?? 2, th);
      tally[e.status]++; tally.buckets[Math.min(4, Math.floor(e.score / 20))]++;
      for (const g of e.gates) { const k = g.split("(")[0]; tally.gates[k] = (tally.gates[k] ?? 0) + 1; }
      if (src.dry_run) continue;
      const prov = Object.fromEntries(Object.keys(c.fields).map(k => [k, { source: c.sources.includes("tx_franchise_tax") && ["city", "zip", "taxpayer_number", "active_status", "legal_name"].includes(k) ? "tx_franchise_tax" : src.connector, fetched_at: fetchedAt }]));
      const { data: rec }: { data: any } = await db.from("intel_records").upsert({ source_id: src.id, external_id: c.external_id, record_type: c.record_type, label: c.label, fields: c.fields, provenance: prov, score: e.score, score_breakdown: e.breakdown, gate_failures: e.gates, status: e.status, contains_personal_data: c.personal, fetched_at: fetchedAt, updated_at: fetchedAt }, { onConflict: "source_id,external_id" }).select("id,status,organization_id").single();
      if (rec?.status === "published" && e.score >= th && !c.personal && src.allowed_public_display) {
        const p = promote(c);
        if (p) { const { error } = await db.from("opportunities").upsert({ ...p, source_id: src.id, rights_id: src.current_rights_id, status: "published", visibility: "public", verification_status: "verified", quality_score: e.score, score_breakdown: e.breakdown, published_at: fetchedAt, last_verified_at: fetchedAt, last_checked_at: fetchedAt, updated_at: fetchedAt }, { onConflict: "source_id,source_record_id" }); if (!error) tally.opps_upserted++; }
      }
      if (rec && c.record_type === "contractor" && !c.personal) { const id = await resolveOrg(db, src, c, e, rec.status === "published"); if (id) { tally.orgs_upserted++; if (!rec.organization_id) await db.from("intel_records").update({ organization_id: id }).eq("id", rec.id); } }
    }
    return { new_count: tally.fetched };
  });
  if (run.status === "succeeded") await db.from("sources").update({ last_successful_sync: fetchedAt, error_status: null }).eq("id", src.id);
  else await db.from("sources").update({ error_status: (run as any).reason ?? run.status }).eq("id", src.id);
  return { source: src.name, run: run.status, reason: (run as any).reason, ...tally };
}

/** Entity resolution: one organization per entity_key (fallback license/UEI). Never overwrites a claimed org's profile; only adds verification. */
export async function resolveOrg(db: SupabaseClient, src: any, c: Candidate, e: { score: number; breakdown: unknown }, publish: boolean) {
  const f = c.fields as any; const key = f.entity_key as string;
  let q = db.from("organizations").select("id,claim_status,verification_sources,quality_score").limit(1);
  q = f.uei ? q.or(`entity_key.eq.${JSON.stringify(key)},uei.eq.${f.uei}`) : f.license_number ? q.or(`entity_key.eq.${JSON.stringify(key)},license_number.eq.${f.license_number}`) : q.eq("entity_key", key);
  const { data: hit } = await q.maybeSingle();
  const vs = Array.from(new Set([...(hit?.verification_sources ?? []), ...c.sources]));
  if (hit) {
    const patch: Record<string, unknown> = { verification_sources: vs, last_checked_at: new Date().toISOString(), quality_score: Math.max(hit.quality_score ?? 0, e.score), score_breakdown: e.breakdown };
    if (hit.claim_status === "unclaimed") Object.assign(patch, { is_directory_listed: publish || undefined, city: f.city ?? undefined, zip: f.zip ?? undefined, primary_trade: f.trade ?? undefined, license_number: f.license_number ?? undefined, taxpayer_number: f.taxpayer_number ?? undefined, uei: f.uei ?? undefined });
    Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);
    await db.from("organizations").update(patch).eq("id", hit.id); return hit.id as string;
  }
  if (!publish) return null; // unverified entities stay in intel_records only (review queue), not in the Directory
  const { data: ins } = await db.from("organizations").insert({ business_name: f.legal_name, kind: "contractor", claim_status: "unclaimed", is_directory_listed: true, city: f.city, zip: f.zip, primary_trade: f.trade, license_number: f.license_number, taxpayer_number: f.taxpayer_number, uei: f.uei, entity_key: key, quality_score: e.score, score_breakdown: e.breakdown, verification_sources: vs, intel_label: c.label, source_id: src.id, rights_id: src.current_rights_id, last_checked_at: new Date().toISOString() }).select("id").single();
  return ins?.id ?? null;
}

/** Cron entry: every approved+enabled source whose schedule is due. */
export async function runDueSources(db: SupabaseClient, opts: { force?: boolean; only?: string; limit?: number; connector?: string; parallel?: boolean } = {}) {
  let q = db.from("sources").select("*").not("connector", "is", null).neq("connector", "franchise_tax"); if (opts.only) q = q.eq("id", opts.only);
  q = opts.connector ? q.eq("connector", opts.connector) : q.neq("connector", "civicplus_bids"); // Firecrawl portals run in /api/cron/firecrawl
  const { data } = await q;
  if (opts.parallel) return Promise.all((data ?? []).map(s => runSource(db, s, { force: opts.force, limit: opts.limit }).catch(e => ({ source: s.name, error: String(e).slice(0, 200) }))));
  const out = [];
  for (const s of data ?? []) out.push(await runSource(db, s, { force: opts.force, limit: opts.limit }).catch(e => ({ source: s.name, error: String(e).slice(0, 200) })));
  return out;
}
