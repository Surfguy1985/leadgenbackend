import { createHash, randomBytes } from "node:crypto";
// DFW direct-lead market (v3 decision: direct leads DFW, public bids all TX). 3-digit ZIP prefixes for the DFW metro.
const DFW_PREFIXES = ["750", "751", "752", "753", "754", "760", "761", "762"];
export const isDfwZip = (zip: string) => /^\d{5}$/.test(zip) && DFW_PREFIXES.includes(zip.slice(0, 3));
export const isTexasZip = (zip: string) => /^\d{5}$/.test(zip) && ((+zip >= 75000 && +zip <= 79999) || (+zip >= 88500 && +zip <= 88599));

type Policy = { direct_urgent: { reconfirm_h: number; hide_h: number }; direct: { reconfirm_d: number; hide_d: number }; recurring: { reconfirm_d: number; hide_d: number } };
export const DEFAULT_POLICY: Policy = { direct_urgent: { reconfirm_h: 48, hide_h: 72 }, direct: { reconfirm_d: 7, hide_d: 14 }, recurring: { reconfirm_d: 30, hide_d: 30 } };
const H = 3600_000, D = 24 * H;
/** Reconfirm + auto-hide times for a direct request, from app_settings.archive_policy. */
export function lifecycleDates(urgency: "urgent" | "normal" | "recurring" = "normal", now = new Date(), p: Policy = DEFAULT_POLICY) {
  const t = now.getTime();
  const [rc, hide] = urgency === "urgent" ? [p.direct_urgent.reconfirm_h * H, p.direct_urgent.hide_h * H]
    : urgency === "recurring" ? [p.recurring.reconfirm_d * D, p.recurring.hide_d * D] : [p.direct.reconfirm_d * D, p.direct.hide_d * D];
  return { reconfirm_due_at: new Date(t + rc).toISOString(), hide_after: new Date(t + hide).toISOString() };
}
/** RT-21: random single-purpose token; only the hash is stored. */
export function newToken() { const token = randomBytes(32).toString("base64url"); return { token, hash: hashToken(token) }; }
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const CONSENT_TEXT = {
  contact_share: "I agree to share this request and my contact details with up to 5 eligible, matched contractors through Crewforthat so they can contact me about this job. I can withdraw at any time. No contractor or outcome is guaranteed.",
  public_listing: "Optional: show a non-identifying summary of this job (trade, city, timing, no name/address/contact) on Crewforthat's public job board. I can unlist it at any time.",
};
