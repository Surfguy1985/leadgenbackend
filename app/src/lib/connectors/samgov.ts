import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "../supabase";
import { safeFetch, withIngestionRun, FetchDenied } from "../fetcher";
import { mapNotice, samQuery, type SamNotice } from "./samgovMap";

export const SAM_SOURCE_NAME = "SAM.gov Contract Opportunities";
const BASE = "https://api.sam.gov/opportunities/v2/search";

async function sourceId() {
  const { data } = await adminDb().from("sources").select("id").eq("name", SAM_SOURCE_NAME).maybeSingle();
  if (!data) throw new FetchDenied("source_not_registered"); return data.id as string;
}

async function pull(src: string, days: number, maxPages: number) {
  const key = process.env.SAM_GOV_API_KEY; if (!key) throw new FetchDenied("SAM_GOV_API_KEY missing");
  const to = new Date(), from = new Date(Date.now() - days * 86400_000);
  const notices: SamNotice[] = []; let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const q = samQuery(from, to, page * 100); q.set("api_key", key);
    const r = await safeFetch(src, `${BASE}?${q}`, { skipRobots: true }); // official API: robots.txt n/a; key never logged
    if (r.status === 429) throw new Error("sam_rate_limited");
    if (r.status >= 400) throw new Error(`sam_http_${r.status}`);
    const j = JSON.parse(r.body.toString("utf8")) as { totalRecords?: number; opportunitiesData?: SamNotice[] };
    total = j.totalRecords ?? 0; notices.push(...(j.opportunitiesData ?? []));
    if ((page + 1) * 100 >= total) break;
  }
  return { notices, total };
}

/** dryRun: fetch + map only, no DB writes except nothing. Live: records ingestion run, raw rows, upserts public bids. */
export async function runSamGov({ dryRun = true, days = 3, maxPages = 2 } = {}) {
  const src = await sourceId();
  if (dryRun) {
    const { notices, total } = await pull(src, days, maxPages);
    const mapped = notices.map(n => mapNotice(n)).filter(Boolean);
    return { dryRun: true, totalRecordsTX: total, fetched: notices.length, inScope: mapped.length, sample: mapped.slice(0, 5).map(m => ({ title: m!.title, trade: m!.trade, city: m!.city, deadline: m!.deadline, url: m!.official_apply_url })) };
  }
  return withIngestionRun(src, async (runId) => {
    const db = adminDb(); const { notices } = await pull(src, days, maxPages);
    const { data: s } = await db.from("sources").select("current_rights_id").eq("id", src).single();
    let created = 0, updated = 0;
    for (const n of notices) {
      const m = mapNotice(n); if (!m) continue;
      const hash = createHash("sha256").update(JSON.stringify(n)).digest("hex");
      await db.from("raw_ingestions").upsert({ source_id: src, source_record_id: n.noticeId, source_url: m.source_url, payload_hash: hash, permitted_payload: n, ingestion_run_id: runId, processing_status: "processed" }, { onConflict: "source_id,source_record_id,payload_hash", ignoreDuplicates: true });
      const { data: ex } = await db.from("opportunities").select("id").eq("source_id", src).eq("source_record_id", n.noticeId).maybeSingle();
      const row = { ...m, source_id: src, rights_id: s?.current_rights_id, status: "published", visibility: "public", verification_status: "verified", last_checked_at: new Date().toISOString(), last_verified_at: new Date().toISOString(), published_at: n.postedDate ? new Date(n.postedDate).toISOString() : new Date().toISOString() };
      if (ex) { await db.from("opportunities").update({ ...row, published_at: undefined }).eq("id", ex.id); updated++; }
      else { const { error } = await db.from("opportunities").insert(row); if (!error) created++; }
    }
    return { new_count: created, updated_count: updated, result: { created, updated, fetched: notices.length } };
  });
}
