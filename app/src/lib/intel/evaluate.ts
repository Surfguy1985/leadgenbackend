import { decide, scoreRecord } from "@/lib/quality";
import type { Candidate } from "./connectors";

const EVERY: Record<string, number> = { hourly: 3600e3, "6h": 6 * 3600e3, daily: 22 * 3600e3, weekly: 6.5 * 86_400e3 };
export const isDue = (schedule: string, last: string | null, now = Date.now()) => schedule !== "manual" && (!last || now - Date.parse(last) >= (EVERY[schedule] ?? EVERY.daily));

/** Score one candidate; job/contractor use the full rubric. Buyers/permits are intel (never published as jobs). */
export function evaluate(c: Candidate, fetchedAt: string, trustTier: 1 | 2 | 3, th: number) {
  if (c.record_type === "contractor" || c.record_type === "job") {
    const s = scoreRecord({ type: c.record_type, fields: c.fields, checks: c.checks, sourcesAgreeing: new Set(c.sources).size, fetchedAt, trustTier, status: c.status, deadline: c.deadline, trade: c.trade, distanceMiles: c.distanceMiles, valueUsd: c.valueUsd, conflicts: c.conflicts });
    const gates = c.personal ? [...s.gates, "personal_name:not_an_entity"] : s.gates;
    return { ...s, gates, status: decide({ score: s.score, gates }, th) };
  }
  const failed = c.checks.filter(x => x.ok === false).map(x => `failed:${x.name}`);
  const score = failed.length ? 40 : 70 + (c.valueUsd && c.valueUsd > 25_000 ? 15 : 0) + (trustTier === 1 ? 15 : 0);
  return { score, breakdown: { intel: score }, gates: failed, missing: [], status: failed.length ? "review" as const : "published" as const };
}

