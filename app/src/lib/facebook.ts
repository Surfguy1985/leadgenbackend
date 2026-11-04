/** Daily digest of new public bids to Bryce's OWN Facebook Page via the official Graph API (pages_manage_posts).
 *  Disabled unless META_PAGE_ID and META_PAGE_ACCESS_TOKEN are set. One post per day (social_posts unique channel+date). */
import type { SupabaseClient } from "@supabase/supabase-js";
const GRAPH = "https://graph.facebook.com/v21.0";
const SITE = "https://lead-gen-site-dc4966.webflow.io";
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
export type Bid = { id: string; title: string; trade: string; city: string | null; deadline: string | null; budget_max: number | null };
export const metaConfigured = () => !!(process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN);
export const bidUrl = (b: Bid) => `${SITE}/opportunities/${slugify(b.trade)}-${b.id.slice(0, 8)}`;
const tradeLabel = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/** Pure: build the digest text. Returns null if there is nothing to post. */
export function buildDigest(bids: Bid[], day: string, max = 5): { message: string; link: string; ids: string[] } | null {
  const top = bids.slice(0, max); if (!top.length) return null;
  const lines = top.map(b => {
    const due = b.deadline ? ` · due ${new Date(b.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}` : "";
    return `• ${b.title.slice(0, 90)} (${tradeLabel(b.trade)}${b.city ? `, ${b.city}` : ""}${due})\n  ${bidUrl(b)}`;
  });
  const more = bids.length > max ? `\n+${bids.length - max} more on Jobs Now.` : "";
  return { message: `New Texas public bids for ${day}:\n\n${lines.join("\n")}${more}\n\nPublic bids are open to any qualified bidder and aren't exclusive. Free contractor accounts: ${SITE}/for-contractors`, link: `${SITE}/opportunities`, ids: top.map(b => b.id) };
}
/** Rank: soonest deadline first (still open), then largest budget. Pure. */
export function rankBids(bids: Bid[], now = Date.now()): Bid[] {
  return bids.filter(b => !b.deadline || Date.parse(b.deadline) > now)
    .sort((a, b) => (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity) || (b.budget_max ?? 0) - (a.budget_max ?? 0));
}
export const chicagoDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export async function postDailyDigest(db: SupabaseClient, opts: { dryRun?: boolean; f?: typeof fetch } = {}) {
  const day = chicagoDay();
  if (!metaConfigured() && !opts.dryRun) return { status: "not_configured" };
  const { data: prior } = await db.from("social_posts").select("id").eq("channel", "facebook_page").eq("post_date", day).maybeSingle();
  if (prior && !opts.dryRun) return { status: "already_posted", day };
  const since = new Date(Date.now() - 36 * 3600_000).toISOString();
  const { data: posted } = await db.from("social_posts").select("opportunity_ids").eq("channel", "facebook_page").gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  const seen = new Set((posted ?? []).flatMap(p => p.opportunity_ids as string[]));
  const { data } = await db.from("opportunities").select("id,title,trade,city,deadline,budget_max")
    .eq("kind", "public_bid").eq("status", "published").eq("visibility", "public").gte("published_at", since).limit(200);
  const digest = buildDigest(rankBids(((data ?? []) as Bid[]).filter(b => !seen.has(b.id))), day);
  if (!digest) return { status: "nothing_new", day };
  if (opts.dryRun) return { status: "dry_run", day, configured: metaConfigured(), ...digest };
  const r = await (opts.f ?? fetch)(`${GRAPH}/${process.env.META_PAGE_ID}/feed`, { method: "POST",
    body: new URLSearchParams({ message: digest.message, link: digest.link, access_token: process.env.META_PAGE_ACCESS_TOKEN! }) });
  const j = await r.json().catch(() => ({})) as { id?: string; error?: { message?: string; code?: number } };
  if (!r.ok || !j.id) return { status: "failed", http: r.status, error: (j.error?.message ?? "").slice(0, 200) }; // token never echoed
  await db.from("social_posts").insert({ channel: "facebook_page", post_date: day, external_post_id: j.id, opportunity_ids: digest.ids });
  return { status: "posted", day, post_id: j.id, count: digest.ids.length };
}
