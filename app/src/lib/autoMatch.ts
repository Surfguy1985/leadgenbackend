import "server-only";
import { pickMatches, type Candidate } from "./matching";

/** Match every published public opportunity to accepting contractor profiles. Idempotent (ignoreDuplicates).
 *  New matches are inserted with notification_status='suppressed' (no notifications rows, no email); in-app feeds show them. */
export async function matchPublicOpportunities(db: any) {
  const { data: opps } = await db.from("public_opportunities").select("id,kind,title,trade,subtrades,zip,city,property_type,status").in("status", ["published", "matched", "notified"]);
  const { data: rows } = await db.from("contractor_profiles").select("*,organizations(owner_user_id,subscriptions(plan,status))").eq("accepts_leads", true);
  const cands: Candidate[] = (rows ?? []).map((c: any) => ({ ...c, owner_user_id: c.organizations?.owner_user_id ?? null, alerts_left: 1e9,
    paid: (c.organizations?.subscriptions ?? []).some((s: any) => ["active", "trialing"].includes(s.status)) }));
  let made = 0; const per: Record<string, number> = {}; const errors: string[] = [];
  for (const o of opps ?? []) {
    const { picks } = pickMatches({ ...o, subtrades: o.subtrades ?? [] } as any, cands);
    for (const p of picks) {
      const { error } = await db.from("matches").upsert({ opportunity_id: o.id, contractor_id: p.contractor_id, match_score: p.score, match_factors: p.factors, notification_status: "suppressed" }, { onConflict: "opportunity_id,contractor_id", ignoreDuplicates: true });
      if (error) { if (errors.length < 5) errors.push(error.message); } else { made++; per[p.contractor_id] = (per[p.contractor_id] ?? 0) + 1; }
    }
  }
  return { opportunities: opps?.length ?? 0, contractors: cands.length, contractors_with_matches: Object.keys(per).length, matches_considered: made, per_contractor: per, errors };
}
