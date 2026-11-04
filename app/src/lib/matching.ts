/** WF-04 scoring heuristic (spec weights: trade 40, geo 25, qualifications 20, recent activity 10, preferences 5).
 *  A heuristic for routing, NOT a claim about contractor quality. Used by the in-app WF-04 step (lib/workflows.ts). */
export const WEIGHTS = { trade: 40, geo: 25, qualifications: 20, activity: 10, preferences: 5 } as const;
export const REGULATED = ["plumbing","electrical","hvac","roofing"]; // TX licensing (TDLR / TSBPE) — verify per trade

export type Opp = { trade: string; subtrades: string[]; zip: string | null; property_type: string | null; city?: string | null };
export type Contractor = { trades: string[]; zip_codes: string[]; statewide?: boolean; license_status: string; insurance_status: string; accepts_leads: boolean; last_active_at: string | null; preferences: { property_types?: string[] } };

/** DFW metro ZIP3s (750-754, 760-762). No-ZIP signals in our sources are DFW city/county/metro scope. */
export const isDfwZip = (z: string) => /^(75[0-4]|76[0-2])/.test(z);
export const isDfwArea = (o: { city?: string | null }) => true; // all approved discovery sources are DFW-scoped (FW permits, DFW-county USAspending)
export function score(o: Opp, c: Contractor, now = Date.now(), allowStatewidePublicBids = false): { eligible: boolean; score: number; factors: Record<string, number | string> } {
  if (!c.accepts_leads) return { eligible: false, score: 0, factors: { reason: "not_accepting" } };
  const regulated = o.subtrades.some(s => REGULATED.includes(s));
  if (regulated && c.license_status !== "verified") return { eligible: false, score: 0, factors: { reason: "license_required" } };
  const trade = c.trades.includes(o.trade) ? 1 : 0;
  if (!trade) return { eligible: false, score: 0, factors: { reason: "trade_mismatch" } };
  const geo = o.zip && c.zip_codes.includes(o.zip) ? 1 : o.zip && c.zip_codes.some(z => z.slice(0, 3) === o.zip!.slice(0, 3)) ? 0.5 : allowStatewidePublicBids && c.statewide ? 0.5
    : !o.zip && isDfwArea(o) && c.zip_codes.some(isDfwZip) ? 0.5 // no-ZIP prospects/forecasts (city/county/metro scope): DFW service area
    : !o.zip && c.statewide ? 0.25 : 0;
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
export function allocate<T extends { score: number; priority?: boolean }>(kind: "private_lead" | "public_bid", ranked: T[]): { picks: T[]; underMinTarget: boolean } {
  // Priority-slot holders (a real, capped number per city+trade; see lib/monetization) are offered private leads first.
  const sorted = [...ranked].sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || b.score - a.score);
  if (kind !== "private_lead") return { picks: sorted, underMinTarget: false };
  const picks = sorted.slice(0, PRIVATE_LEAD_MAX);
  return { picks, underMinTarget: picks.length < PRIVATE_LEAD_MIN_TARGET };
}

/** WF-04 eligibility + ranking (in-app). Private leads need an active/trialing plan; respects remaining daily alert budget. */
export type Candidate = Contractor & { id: string; owner_user_id: string | null; paid: boolean; alerts_left: number; priority?: boolean };
export function pickMatches(o: Opp & { kind: "private_lead" | "public_bid" }, cs: Candidate[], now = Date.now()) {
  const ranked = cs.flatMap(c => {
    if (!c.owner_user_id || c.alerts_left <= 0) return [];
    if (o.kind !== "public_bid" && !c.paid) return []; // free plans: public bids only (private leads + prospects/forecasts are paid)
    const s = score(o, c, now, o.kind === "public_bid");
    return s.eligible ? [{ contractor_id: c.id, owner_user_id: c.owner_user_id, score: s.score, factors: s.factors, priority: !!c.priority && c.paid }] : [];
  });
  return allocate(o.kind, ranked);
}
