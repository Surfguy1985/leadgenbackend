/** WF-04 scoring heuristic (spec weights: trade 40, geo 25, qualifications 20, recent activity 10, preferences 5).
 *  A heuristic for routing, NOT a claim about contractor quality. Mirrored in n8n/WF-04 Code node. */
export const WEIGHTS = { trade: 40, geo: 25, qualifications: 20, activity: 10, preferences: 5 } as const;
export const REGULATED = ["plumbing","electrical","hvac","roofing"]; // TX licensing (TDLR / TSBPE) — verify per trade

export type Opp = { trade: string; subtrades: string[]; zip: string | null; property_type: string | null };
export type Contractor = { trades: string[]; zip_codes: string[]; license_status: string; insurance_status: string; accepts_leads: boolean; last_active_at: string | null; preferences: { property_types?: string[] } };

export function score(o: Opp, c: Contractor, now = Date.now()): { eligible: boolean; score: number; factors: Record<string, number | string> } {
  if (!c.accepts_leads) return { eligible: false, score: 0, factors: { reason: "not_accepting" } };
  const regulated = o.subtrades.some(s => REGULATED.includes(s));
  if (regulated && c.license_status !== "verified") return { eligible: false, score: 0, factors: { reason: "license_required" } };
  const trade = c.trades.includes(o.trade) ? 1 : 0;
  if (!trade) return { eligible: false, score: 0, factors: { reason: "trade_mismatch" } };
  const geo = o.zip && c.zip_codes.includes(o.zip) ? 1 : o.zip && c.zip_codes.some(z => z.slice(0, 3) === o.zip!.slice(0, 3)) ? 0.5 : 0;
  if (!geo) return { eligible: false, score: 0, factors: { reason: "out_of_area" } };
  const qual = (c.license_status === "verified" ? 0.5 : 0) + (c.insurance_status === "verified" ? 0.5 : 0);
  const days = c.last_active_at ? (now - Date.parse(c.last_active_at)) / 864e5 : 999;
  const activity = days <= 7 ? 1 : days <= 30 ? 0.5 : 0;
  const pref = !c.preferences?.property_types?.length || (o.property_type && c.preferences.property_types.includes(o.property_type)) ? 1 : 0;
  const f = { trade: trade * WEIGHTS.trade, geo: geo * WEIGHTS.geo, qualifications: qual * WEIGHTS.qualifications, activity: activity * WEIGHTS.activity, preferences: pref * WEIGHTS.preferences };
  return { eligible: true, score: Math.round(Object.values(f).reduce((a, b) => a + b, 0) * 100) / 100, factors: f };
}

/** Private leads go to at most 5 contractors (target minimum 3). Public bids are not capped. */
export const PRIVATE_LEAD_MAX = 5, PRIVATE_LEAD_MIN_TARGET = 3;
export function allocate<T extends { score: number }>(kind: "private_lead" | "public_bid", ranked: T[]): { picks: T[]; underMinTarget: boolean } {
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  if (kind !== "private_lead") return { picks: sorted, underMinTarget: false };
  const picks = sorted.slice(0, PRIVATE_LEAD_MAX);
  return { picks, underMinTarget: picks.length < PRIVATE_LEAD_MIN_TARGET };
}
