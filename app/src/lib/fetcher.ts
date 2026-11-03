import "server-only";
import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { adminDb } from "./supabase";
import { checkUrl, isPrivateAddress, robotsAllows, LIMITS, USER_AGENT, type SourcePolicy } from "./fetchPolicy";

export class FetchDenied extends Error { constructor(public reason: string) { super(reason); } }

export async function loadPolicy(sourceId: string): Promise<SourcePolicy> {
  const db = adminDb();
  const { data: s } = await db.from("sources").select("id,enabled,emergency_paused,allowed_hostnames").eq("id", sourceId).maybeSingle();
  if (!s) throw new FetchDenied("unknown_source");
  const { data: can } = await db.rpc("source_can", { p_source: sourceId, p_action: "fetch" });
  return { ...s, allowed_hostnames: s.allowed_hostnames ?? [], canFetch: can === true };
}

async function assertPublicHost(host: string) {
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) throw new FetchDenied("resolves_to_private_address");
}

const robotsCache = new Map<string, { at: number; txt: string }>();
async function robotsOk(u: URL) {
  const key = u.origin; let c = robotsCache.get(key);
  if (!c || Date.now() - c.at > 6 * 3600_000) {
    let txt = "";
    try { const r = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, redirect: "error", signal: AbortSignal.timeout(5000) });
      if (r.status >= 500) throw new FetchDenied("robots_unavailable"); if (r.ok) txt = (await r.text()).slice(0, 500_000); }
    catch (e) { if (e instanceof FetchDenied) throw e; throw new FetchDenied("robots_unavailable"); }
    c = { at: Date.now(), txt }; robotsCache.set(key, c);
  }
  if (!robotsAllows(c.txt, u.pathname + u.search)) throw new FetchDenied("robots_disallow");
}

/** Fetch one URL for a source: rights + allowlist + https + no private IPs + robots + size/time caps + manual redirect re-checks. */
export async function safeFetch(sourceId: string, url: string, opts: { policy?: SourcePolicy; skipRobots?: boolean } = {}) {
  const policy = opts.policy ?? await loadPolicy(sourceId);
  let current = url;
  for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
    const deny = checkUrl(current, policy); if (deny) throw new FetchDenied(deny);
    const u = new URL(current);
    await assertPublicHost(u.hostname);
    if (!opts.skipRobots && policy.allowed_hostnames.length) await robotsOk(u);
    const r = await fetch(current, { headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/xml, text/html;q=0.8" }, redirect: "manual", signal: AbortSignal.timeout(LIMITS.timeoutMs) });
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get("location"); if (!loc) throw new FetchDenied("redirect_without_location"); current = new URL(loc, current).toString(); continue; }
    const len = Number(r.headers.get("content-length") ?? 0); if (len > LIMITS.maxBytes) throw new FetchDenied("too_large");
    const reader = r.body?.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    while (reader) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > LIMITS.maxBytes) { await reader.cancel(); throw new FetchDenied("too_large"); } chunks.push(value); }
    const body = Buffer.concat(chunks);
    return { status: r.status, url: current, contentType: r.headers.get("content-type") ?? "", body, hash: createHash("sha256").update(body).digest("hex") };
  }
  throw new FetchDenied("too_many_redirects");
}

/** Wraps a connector run: records ingestion_runs + connector_health. Blocks (and records) if rights deny fetch. */
export async function withIngestionRun<T>(sourceId: string, fn: (runId: string) => Promise<{ new_count?: number; updated_count?: number; closed_count?: number; result?: T }>) {
  const db = adminDb(); const policy = await loadPolicy(sourceId);
  const blocked = checkUrl("https://" + (policy.allowed_hostnames[0] ?? "invalid.invalid") + "/", policy);
  const { data: run } = await db.from("ingestion_runs").insert({ source_id: sourceId, status: blocked ? "blocked_rights" : "running", error: blocked, finished_at: blocked ? new Date().toISOString() : null }).select("id").single();
  if (blocked) return { status: "blocked_rights" as const, reason: blocked };
  const now = new Date().toISOString();
  try {
    const out = await fn(run!.id);
    await db.from("ingestion_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), new_count: out.new_count ?? 0, updated_count: out.updated_count ?? 0, closed_count: out.closed_count ?? 0 }).eq("id", run!.id);
    await db.from("connector_health").upsert({ source_id: sourceId, last_success_at: now, last_checked_at: now, consecutive_failures: 0, last_error: null, updated_at: now });
    return { status: "succeeded" as const, result: out.result };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "error";
    await db.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: msg }).eq("id", run!.id);
    const { data: h } = await db.from("connector_health").select("consecutive_failures").eq("source_id", sourceId).maybeSingle();
    await db.from("connector_health").upsert({ source_id: sourceId, last_checked_at: now, consecutive_failures: (h?.consecutive_failures ?? 0) + 1, last_error: msg, updated_at: now });
    return { status: "failed" as const, reason: msg };
  }
}
