import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Claim monetization. Every number shown to a business comes from the DB at request time.
 * No timers, invented counts or invented scarcity (FTC Act s.5 / Texas DTPA). If a number is 0 we say so or hide it.
 */
export const DEFAULTS = { foundingSlots: 10, foundingPercentOff: 25, prioritySlots: 5 };

export type Settings = { foundingSlots: number; foundingPercentOff: number; foundingCoupon: string | null; prioritySlots: number; headlineVariants: string[] };
export async function loadSettings(db: SupabaseClient): Promise<Settings> {
  const { data } = await db.from("app_settings").select("key,value").in("key", ["founding_offer", "priority_slots", "claim_headlines"]);
  const m = new Map((data ?? []).map((r: { key: string; value: any }) => [r.key, r.value]));
  const f = m.get("founding_offer") ?? {}; const p = m.get("priority_slots") ?? {}; const h = m.get("claim_headlines");
  return {
    foundingSlots: clampInt(f.slots, DEFAULTS.foundingSlots, 0, 1000), foundingPercentOff: clampInt(f.percent_off, DEFAULTS.foundingPercentOff, 0, 90),
    foundingCoupon: typeof f.stripe_coupon === "string" && f.stripe_coupon ? f.stripe_coupon : null,
    prioritySlots: clampInt(p.per_city_trade, DEFAULTS.prioritySlots, 0, 50),
    headlineVariants: Array.isArray(h) && h.length ? h.map(String).slice(0, 4) : HEADLINES,
  };
}
const clampInt = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };

/** A/B headlines: stable per visitor (hash of a visitor id) so a person always sees the same one. */
export const HEADLINES = ["Is your business already listed? Claim it free.", "Customers are finding your business here. Make sure it's right."];
export function pickVariant(visitorId: string, n: number) { return n <= 1 ? 0 : parseInt(createHash("sha256").update(visitorId).digest("hex").slice(0, 8), 16) % n; }

/** Real-slot counters. remaining never goes below 0; open=false hides the offer entirely. */
export function slotStatus(cap: number, used: number) { const remaining = Math.max(0, cap - used); return { cap, used, remaining, open: cap > 0 && remaining > 0 }; }

/** Truthful teaser lines; returns only lines whose numbers are > 0. */
export function teaserLines(t: { bids30d: number; privateLeads30d: number; views30d: number; city?: string | null; trade?: string | null }) {
  const where = t.city ? ` in ${t.city}` : ""; const what = t.trade ? `${t.trade.replace(/_/g, " ")} ` : "";
  const out: string[] = [];
  if (t.bids30d > 0) out.push(`${t.bids30d} ${what}public bid${t.bids30d === 1 ? "" : "s"}${where} in the last 30 days`);
  if (t.privateLeads30d > 0) out.push(`${t.privateLeads30d} verified private request${t.privateLeads30d === 1 ? "" : "s"}${where} in the last 30 days (details unlock for paid members)`);
  if (t.views30d > 0) out.push(`${t.views30d} ${t.views30d === 1 ? "person" : "people"} viewed this listing in the last 30 days`);
  return out;
}
/** Competitor notice: only when it actually happened; never names the competitor. */
export function competitorLine(n: { claimed: number; paid: number; city?: string | null; trade?: string | null }) {
  const scope = [n.trade?.replace(/_/g, " "), n.city].filter(Boolean).join(" businesses in ") || "businesses near you";
  if (n.paid > 0) return `${n.paid} other ${scope} ${n.paid === 1 ? "has" : "have"} upgraded to a paid plan.`;
  if (n.claimed > 0) return `${n.claimed} other ${scope} ${n.claimed === 1 ? "has" : "have"} already claimed ${n.claimed === 1 ? "its" : "their"} profile.`;
  return null;
}

/** Hashed daily viewer id (no raw IP stored). */
export const viewerHash = (ip: string, ua: string, day: string, salt: string) => createHash("sha256").update(`${salt}|${day}|${ip}|${ua}`).digest("hex").slice(0, 32);

/** Signed unsubscribe token for claim-reminder email (CAN-SPAM). */
export const unsubToken = (email: string, secret: string) => createHmac("sha256", secret).update(`unsub:${email.toLowerCase()}`).digest("hex").slice(0, 32);

/** CAN-SPAM: identifies sender, real postal address, clear unsubscribe, honest subject. Returns null if no postal address is configured (then we must not send). */
export function reminderEmail(p: { businessName: string; claimUrl: string; unsubUrl: string; postal: string | null; lines: string[]; step: number }) {
  if (!p.postal) return null;
  const subject = p.step === 1 ? `Your business ${p.businessName} is listed on Crewforthat` : `Reminder: claim the free ${p.businessName} profile`;
  const facts = p.lines.length ? `<ul>${p.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
  const html = `<p>Hi,</p><p>${esc(p.businessName)} appears in the Crewforthat business directory, built from public records. You can claim the profile for free to correct details and get bid alerts.</p>${facts}<p><a href="${p.claimUrl}">Claim your free profile</a></p>`
    + `<hr><p style="font-size:12px;color:#666">This is a one-time business notice from Crewforthat about a public directory listing. We send at most 2 reminders. <a href="${p.unsubUrl}">Unsubscribe</a> and we won't email this address again.<br>Crewforthat · ${esc(p.postal)}</p>`;
  return { subject, html };
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Real numbers for one directory org. */
export async function listingStats(db: SupabaseClient, org: { id: string; city: string | null; trade: string | null }) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString(); const s = await loadSettings(db);
  const q = (kind: string) => { let x = db.from("opportunities").select("id", { count: "exact", head: true }).eq("kind", kind).eq("status", "published").gte("published_at", since); if (org.city) x = x.ilike("city", org.city); if (org.trade) x = x.eq("trade", org.trade); return x; };
  const peers = () => { let x = db.from("organizations").select("id", { count: "exact", head: true }).eq("claim_status", "claimed").neq("id", org.id); if (org.city) x = x.ilike("city", org.city); if (org.trade) x = x.eq("primary_trade", org.trade); return x; };
  const [bids, priv, views, claimed, paidPeers, founding, priority] = await Promise.all([
    q("public_bid"), q("private_lead"),
    db.from("listing_views").select("id", { count: "exact", head: true }).eq("organization_id", org.id).gte("day", since.slice(0, 10)),
    peers(),
    db.from("funnel_events").select("organization_id", { count: "exact", head: true }).eq("event", "paid").eq("city", (org.city ?? "").toLowerCase()).eq("trade", org.trade ?? "").neq("organization_id", org.id),
    db.from("founding_members").select("organization_id", { count: "exact", head: true }).eq("city", (org.city ?? "").toLowerCase()).eq("trade", org.trade ?? ""),
    db.from("priority_slots").select("organization_id", { count: "exact", head: true }).eq("city", (org.city ?? "").toLowerCase()).eq("trade", org.trade ?? ""),
  ]);
  const t = { bids30d: bids.count ?? 0, privateLeads30d: priv.count ?? 0, views30d: views.count ?? 0, city: org.city, trade: org.trade };
  return {
    ...t, lines: teaserLines(t),
    competitor: competitorLine({ claimed: claimed.count ?? 0, paid: paidPeers.count ?? 0, city: org.city, trade: org.trade }),
    founding: { ...slotStatus(s.foundingSlots, founding.count ?? 0), percentOff: s.foundingPercentOff, couponReady: !!s.foundingCoupon },
    priority: slotStatus(s.prioritySlots, priority.count ?? 0),
  };
}

/** On approval: reserve a founding seat if one is really left for the org's city+trade. DB unique/count trigger is the source of truth. */
export async function reserveFounding(db: SupabaseClient, org: { id: string; city: string | null; trade: string | null }) {
  if (!org.city || !org.trade) return false;
  const { error } = await db.rpc("reserve_founding_seat", { p_org: org.id, p_city: org.city.toLowerCase(), p_trade: org.trade });
  return !error;
}
export async function track(db: SupabaseClient, event: "view" | "claim_start" | "verified" | "trial" | "paid" | "canceled", org: { id: string; city?: string | null; trade?: string | null }, meta: Record<string, unknown> = {}) {
  await db.from("funnel_events").insert({ event, organization_id: org.id, city: org.city ?? "", trade: org.trade ?? "", meta }).then(() => null, () => null);
}

/** Stripe webhook hook: logs trial/paid/canceled once per subscription+status, grants a capped priority slot to Pro Match+ (real limit, first come). */
export async function onPlanChange(db: SupabaseClient, orgId: string | null, plan: string | null, status: string, subId: string) {
  if (!orgId) return;
  const ev = status === "trialing" ? "trial" : status === "active" ? "paid" : status === "canceled" ? "canceled" : null; if (!ev) return;
  const { data: o } = await db.from("organizations").select("id,city,primary_trade").eq("id", orgId).maybeSingle(); if (!o) return;
  const { count } = await db.from("funnel_events").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("event", ev).contains("meta", { sub: subId });
  if (!count) await track(db, ev, { id: o.id, city: (o.city ?? "").toLowerCase(), trade: o.primary_trade }, { sub: subId, plan });
  if (o.city && o.primary_trade && PRIORITY_PLANS.has(plan ?? "")) {
    if (ev === "canceled") await db.from("priority_slots").delete().eq("organization_id", orgId);
    else await db.rpc("grant_priority_slot", { p_org: orgId, p_city: o.city.toLowerCase(), p_trade: o.primary_trade });
  }
}
export const PRIORITY_PLANS = new Set(["pro_match", "growth", "elite"]);
/** What each plan really gets (shown in upsell). */
export const PLAN_PERKS: Record<string, string[]> = {
  free: ["Basic profile", "Public bid alerts (weekly)"],
  starter: ["Verified Pro badge", "Private leads in 1 trade / 5 ZIPs", "Daily alerts"],
  pro_match: ["Everything in Starter", "Top placement in your city + trade", "Lead-match priority (limited slots per city + trade)", "5 trades / 50 ZIPs"],
  growth: ["Everything in Pro Match", "Multiple territories", "3 team seats"],
  elite: ["Everything in Growth", "10 team seats", "Advanced reporting"],
};
