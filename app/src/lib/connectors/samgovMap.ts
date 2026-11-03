// Pure SAM.gov Opportunities API v2 mapping (unit-tested). Public federal data; Texas place-of-performance only.
export type SamNotice = {
  noticeId: string; title: string; solicitationNumber?: string; fullParentPathName?: string; postedDate?: string; type?: string; baseType?: string;
  responseDeadLine?: string | null; archiveDate?: string | null; naicsCode?: string; active?: string; uiLink?: string; description?: string;
  placeOfPerformance?: { city?: { name?: string }; state?: { code?: string }; zip?: string } | null; typeOfSetAsideDescription?: string | null;
};
// Facility / construction NAICS relevant to Crewforthat trades
const NAICS: [string, string][] = [["561730", "landscaping"], ["561720", "cleaning"], ["561790", "cleaning"], ["561210", "commercial_construction"], ["236", "commercial_construction"], ["237", "commercial_construction"], ["238", "commercial_construction"]];
export const tradeForNaics = (n?: string) => (n ? NAICS.find(([p]) => n.startsWith(p))?.[1] : undefined) ?? null;
const SKIP_TYPES = /award notice|cancel|justification|sale of surplus|intent to bundle/i;

export function samQuery(from: Date, to: Date, offset = 0, limit = 100) {
  const d = (x: Date) => `${String(x.getUTCMonth() + 1).padStart(2, "0")}/${String(x.getUTCDate()).padStart(2, "0")}/${x.getUTCFullYear()}`;
  return new URLSearchParams({ postedFrom: d(from), postedTo: d(to), state: "TX", limit: String(limit), offset: String(offset), ptype: "o,k,p,r" });
}

/** Returns a normalized public_bid row, or null if out of scope (not TX, not a relevant trade, inactive, award notice, past deadline). */
export function mapNotice(n: SamNotice, now = new Date()) {
  if (!n.noticeId || !n.title) return null;
  if ((n.placeOfPerformance?.state?.code ?? "").toUpperCase() !== "TX") return null;
  if (n.active && n.active.toLowerCase() !== "yes") return null;
  if (SKIP_TYPES.test(`${n.type ?? ""} ${n.baseType ?? ""}`)) return null;
  const trade = tradeForNaics(n.naicsCode); if (!trade) return null;
  const deadline = n.responseDeadLine ? new Date(n.responseDeadLine) : null;
  if (deadline && !isNaN(+deadline) && deadline < now) return null;
  const ui = n.uiLink && /^https:\/\/sam\.gov\//.test(n.uiLink) ? n.uiLink : `https://sam.gov/opp/${encodeURIComponent(n.noticeId)}/view`;
  const agency = (n.fullParentPathName ?? "").split(".")[0]?.trim();
  const summary = [n.type, agency && `Agency: ${agency}`, n.naicsCode && `NAICS ${n.naicsCode}`, n.typeOfSetAsideDescription && `Set-aside: ${n.typeOfSetAsideDescription}`, n.solicitationNumber && `Solicitation ${n.solicitationNumber}`].filter(Boolean).join(" · ");
  return {
    source_record_id: n.noticeId, kind: "public_bid", listing_type: "public_bid", title: n.title.slice(0, 300), summary: summary.slice(0, 1000), trade,
    city: n.placeOfPerformance?.city?.name ?? null, state: "TX", zip: /^\d{5}/.test(n.placeOfPerformance?.zip ?? "") ? n.placeOfPerformance!.zip!.slice(0, 5) : null,
    geographic_scope: n.placeOfPerformance?.city?.name ? "city" : "statewide", deadline: deadline && !isNaN(+deadline) ? deadline.toISOString() : null,
    hide_after: deadline && !isNaN(+deadline) ? deadline.toISOString() : null, source_url: ui, official_apply_url: ui,
    organization_ref: agency || null, is_inferred: false, reliability: "official",
  };
}
