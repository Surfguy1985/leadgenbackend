// Public, read-only feed helpers (Webflow client-side cards). Whitelisted fields only; rights/visibility come from the anon RLS view.
export const FEED_ORIGINS = ["https://lead-gen-site-dc4966.webflow.io", "https://crewforthat.com", "https://www.crewforthat.com"];
export const TAB_MAP: Record<string, string> = { jobs_now: "jobs_now", upcoming: "future_contracts", future_contracts: "future_contracts", buyers: "find_buyers", find_buyers: "find_buyers" };
export const PAGE_SIZE = 24;
export function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return { "Access-Control-Allow-Origin": FEED_ORIGINS.includes(o) ? o : FEED_ORIGINS[0], Vary: "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
}
export const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };
/** Sanitize free-text search for a PostgREST or() filter: letters/digits/space/-' only. */
export const cleanQ = (s: string | null) => (s ?? "").replace(/[^\p{L}\p{N} '\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
export const cleanTrade = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z_ ]/g, "").trim().replace(/ /g, "_").slice(0, 40);
export const pageNum = (s: string | null) => Math.min(200, Math.max(1, Math.floor(Number(s) || 1)));
export const OPP_FIELDS = "id,kind,listing_type,tab,title,summary,trade,city,state,zip,deadline,source_url,official_apply_url,published_at,last_checked_at,last_verified_at,geographic_scope,quality_score";
