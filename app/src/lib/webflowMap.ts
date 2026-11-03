// Pure mappers from DB rows to Webflow CMS fieldData. Whitelist only — never contacts, owners, or private fields.
export const OPP_LABEL: Record<string, string> = { public_bid: "Public bid (not exclusive)", discovery_signal: "Discovery signal (unverified)" };
export const TRADE_LABEL: Record<string, string> = { cleaning: "Cleaning & janitorial", landscaping: "Landscaping & grounds", commercial_construction: "Commercial construction", hvac: "HVAC", plumbing: "Plumbing", electrical: "Electrical", roofing: "Roofing", painting: "Painting", flooring: "Flooring" };
export const tradeLabel = (t: string) => TRADE_LABEL[t] ?? t.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
export function tabFor(listingType: string | null, kind: string): "jobs_now" | "upcoming" | "buyers" {
  if (listingType === "upcoming_forecast") return "upcoming";
  if (listingType === "buyer_prospect") return "buyers";
  return kind === "discovery_signal" && listingType !== "public_bid" ? "upcoming" : "jobs_now";
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
type Opp = { id: string; kind: string; listing_type?: string | null; title: string; summary?: string | null; trade: string; city?: string | null; zip?: string | null; deadline?: string | null; source_url?: string | null; official_apply_url?: string | null; published_at?: string | null; last_verified_at?: string | null; last_checked_at?: string | null; geographic_scope?: string | null };
export function oppFields(o: Opp) {
  return {
    name: o.title.slice(0, 256), slug: `${slugify(o.trade)}-${o.id.slice(0, 8)}`, "opportunity-id": o.id, summary: (o.summary ?? "").slice(0, 2000),
    "kind-label": OPP_LABEL[o.kind] ?? o.kind, trade: o.trade, "trade-label": tradeLabel(o.trade), city: o.city ?? "", zip: o.zip ?? "",
    deadline: o.deadline ?? null, "source-url": o.source_url ?? "", "published-date": o.published_at ?? null, "last-verified": o.last_verified_at ?? null,
    tab: tabFor(o.listing_type ?? null, o.kind), "listing-type": o.listing_type ?? o.kind, "geographic-scope": o.geographic_scope ?? "",
    "official-apply-url": o.official_apply_url ?? "", "last-checked": o.last_checked_at ?? o.last_verified_at ?? null,
  };
}
type Org = { id: string; business_name: string; kind: string; city?: string | null; zip?: string | null; public_website?: string | null; vendor_onboarding_url?: string | null; claim_status: string; last_checked_at?: string | null; slug?: string | null };
export function orgFields(o: Org) {
  return {
    name: o.business_name.slice(0, 256), slug: o.slug || `${slugify(o.business_name)}-${o.id.slice(0, 6)}`, "organization-id": o.id, kind: o.kind,
    city: o.city ?? "", zip: o.zip ?? "", "public-website": o.public_website ?? "", "vendor-onboarding-url": o.vendor_onboarding_url ?? "",
    "claim-status": o.claim_status, "last-checked": o.last_checked_at ?? null,
  };
}
export const isDirectoryPublic = (o: { is_directory_listed: boolean; source_id: string | null; public_profile_optin: boolean }, sourcePublishOk: boolean) =>
  o.is_directory_listed && (o.source_id === null ? o.public_profile_optin : sourcePublishOk);
