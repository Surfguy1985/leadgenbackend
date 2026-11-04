/**
 * Record quality scoring (0-100) + hard publish gates. Pure; unit-tested.
 * Components (weights): completeness 30, verification 30, freshness 15, fit 15, trust 10.
 * Any hard-gate failure => not published, goes to the admin review queue with reasons.
 */
export type Prov = { source: string; fetched_at: string };
export type Check = { name: string; ok: boolean | null; detail?: string }; // null = not checked/unavailable
export type ScoreInput = {
  type: "job" | "contractor";
  fields: Record<string, unknown>;
  checks: Check[];              // cross-checks, url resolves, geocode-in-city, etc.
  sourcesAgreeing: number;      // independent sources that confirmed the entity/record
  fetchedAt: string; trustTier: 1 | 2 | 3; // 1 = official government API
  status?: string | null; deadline?: string | null;
  trade?: string | null; distanceMiles?: number | null; valueUsd?: number | null;
  conflicts?: string[];
};
export const REQUIRED = {
  job: ["title", "buyer", "location", "trade", "deadline", "official_url"],
  contractor: ["legal_name", "trade", "location", "license_or_entity_id", "active_status", "business_contact"],
} as const;
const W = { completeness: 30, verification: 30, freshness: 15, fit: 15, trust: 10 };
const present = (v: unknown) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.length === 0);

export function scoreRecord(r: ScoreInput, now = Date.now()) {
  const req = REQUIRED[r.type]; const missing = req.filter(k => !present(r.fields[k]));
  const optionalBonus = r.type === "job" && present(r.fields.value) ? 1 : 0;
  const completeness = Math.round(W.completeness * ((req.length - missing.length + optionalBonus) / (req.length + (r.type === "job" ? 1 : 0))));
  const checked = r.checks.filter(c => c.ok !== null); const passed = checked.filter(c => c.ok).length;
  const crossOk = r.sourcesAgreeing >= 2;
  const verification = Math.round(W.verification * (0.5 * (crossOk ? 1 : r.sourcesAgreeing >= 1 ? 0.4 : 0) + 0.5 * (checked.length ? passed / checked.length : 0)));
  const ageDays = Math.max(0, (now - Date.parse(r.fetchedAt)) / 86_400_000);
  const freshness = Math.round(W.freshness * (ageDays <= 1 ? 1 : ageDays <= 7 ? 0.8 : ageDays <= 30 ? 0.5 : ageDays <= 90 ? 0.2 : 0));
  const prox = r.distanceMiles == null ? 0.5 : r.distanceMiles <= 30 ? 1 : r.distanceMiles <= 60 ? 0.7 : r.distanceMiles <= 150 ? 0.3 : 0;
  const size = r.type !== "job" || r.valueUsd == null ? 0.5 : r.valueUsd >= 25_000 ? 1 : r.valueUsd >= 5_000 ? 0.7 : 0.4;
  const fit = Math.round(W.fit * ((r.trade ? 0.4 : 0) + 0.35 * prox + 0.25 * size));
  const trust = Math.round(W.trust * (r.trustTier === 1 ? 1 : r.trustTier === 2 ? 0.7 : 0.3));
  const gates: string[] = [];
  for (const m of missing) gates.push(`missing:${m}`);
  for (const c of r.checks) if (c.ok === false) gates.push(`failed:${c.name}${c.detail ? `(${c.detail})` : ""}`);
  const st = (r.status ?? "").toLowerCase();
  if (/(expired|cancel|inactive|forfeit|revoked|closed|withdrawn)/.test(st)) gates.push(`status:${st}`);
  if (r.type === "job" && r.deadline && Date.parse(r.deadline) <= now) gates.push("expired:deadline_passed");
  for (const c of r.conflicts ?? []) gates.push(`conflict:${c}`);
  const score = Math.max(0, Math.min(100, completeness + verification + freshness + fit + trust));
  return { score, breakdown: { completeness, verification, freshness, fit, trust }, gates, missing };
}
/** Publish decision: gates block regardless of score; otherwise score >= threshold. */
export function decide(s: { score: number; gates: string[] }, threshold = 80): "published" | "review" {
  return s.gates.length === 0 && s.score >= threshold ? "published" : "review";
}

/**
 * Grounding guard for LLM (Grok) extraction: keep only values that literally occur in the source text
 * (case/whitespace-insensitive; numbers digit-normalised). Anything else is dropped and reported. Provenance is attached per field.
 */
export function groundFields(extracted: Record<string, unknown>, sourceText: string, prov: Prov) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const hay = norm(sourceText); const digits = sourceText.replace(/(\d),(?=\d{3})/g, "$1").replace(/[^0-9]/g, " ").replace(/\s+/g, " ");
  const kept: Record<string, unknown> = {}; const dropped: string[] = []; const provenance: Record<string, Prov> = {};
  for (const [k, v] of Object.entries(extracted)) {
    if (!present(v)) continue;
    const s = String(v); const ok = typeof v === "number" ? (` ${digits} `).includes(` ${String(v).replace(/[^0-9]/g, "")} `) || hay.includes(norm(s)) : hay.includes(norm(s));
    if (ok) { kept[k] = v; provenance[k] = prov; } else dropped.push(k);
  }
  return { fields: kept, provenance, dropped };
}

/** Dedupe key for entity resolution: normalised name + 5-digit ZIP (or city). */
export function entityKey(name: string, zipOrCity: string | null | undefined) {
  const n = name.toUpperCase().replace(/&/g, " AND ").replace(/[.,'"()]/g, " ")
    .replace(/\b(LLC|L L C|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|PLLC|DBA|THE)\b/g, " ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const loc = (zipOrCity ?? "").toString().trim().toUpperCase().slice(0, 5);
  return `${n}|${loc}`;
}
/** Spec classification labels. Permits are never "hiring". */
export type Label = "active_job" | "future_procurement" | "business_prospect" | "contractor_profile" | "unverified_signal" | "project_signal";
export function classify(kind: "solicitation" | "award" | "permit" | "license" | "hoa" | "franchise", opts: { open?: boolean } = {}): Label {
  if (kind === "solicitation") return opts.open ? "active_job" : "future_procurement";
  if (kind === "award") return "business_prospect";   // buyer that has bought this trade before; prospect, not a job
  if (kind === "permit") return "project_signal";     // a permit is activity, never a hiring claim
  if (kind === "license") return "contractor_profile";
  if (kind === "hoa") return "business_prospect";
  return "unverified_signal";
}
export const LABEL_TEXT: Record<Label, string> = {
  active_job: "Open bid", future_procurement: "Upcoming procurement", business_prospect: "Prospect (not a job posting)",
  contractor_profile: "Contractor profile", unverified_signal: "Unverified signal", project_signal: "Project activity (permit issued; not a hiring post)",
};
