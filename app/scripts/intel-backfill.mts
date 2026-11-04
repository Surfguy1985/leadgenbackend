/** One-off/backfill: run approved intel sources live, then match every published public opportunity to contractor profiles.
 *  Outbound notifications are SUPPRESSED (matches get notification_status='suppressed'; no notifications rows, no email). */
import { adminDb } from "../src/lib/supabase";
import { runDueSources } from "../src/lib/intel/engine";
import { runSamGov } from "../src/lib/connectors/samgov";
import { pickMatches, type Candidate } from "../src/lib/matching";

const db = adminDb(); const args = new Set(process.argv.slice(2));
if (!args.has("--match-only")) {
  if (process.env.SAM_GOV_API_KEY) console.log("samgov", JSON.stringify(await runSamGov({ dryRun: false, days: 14, maxPages: 5 }).catch(e => ({ error: String(e).slice(0, 200) }))));
  for (const r of await runDueSources(db, { force: true })) { const { buckets, ...x } = r as any; console.log("intel", JSON.stringify(x)); }
}
const { data: opps } = await db.from("public_opportunities").select("id,kind,title,trade,subtrades,zip,city,property_type,status");
const { data: rows } = await db.from("contractor_profiles").select("*,organizations(owner_user_id,subscriptions(plan,status))").eq("accepts_leads", true);
const cands: Candidate[] = (rows ?? []).map((c: any) => ({ ...c, owner_user_id: c.organizations?.owner_user_id ?? null, alerts_left: 1e9,
  paid: (c.organizations?.subscriptions ?? []).some((s: any) => ["active", "trialing"].includes(s.status)) }));
let made = 0; const per = new Map<string, number>();
for (const o of opps ?? []) {
  if (!["published", "matched", "notified"].includes(o.status)) continue;
  const { picks } = pickMatches({ ...o, subtrades: o.subtrades ?? [] } as any, cands);
  for (const p of picks) {
    const { error } = await db.from("matches").upsert({ opportunity_id: o.id, contractor_id: p.contractor_id, match_score: p.score, match_factors: p.factors, notification_status: "suppressed" }, { onConflict: "opportunity_id,contractor_id", ignoreDuplicates: true });
    if (!error) { made++; per.set(p.contractor_id, (per.get(p.contractor_id) ?? 0) + 1); } else console.log("match_err", error.message);
  }
}
console.log("match", JSON.stringify({ opportunities: opps?.length ?? 0, contractors: cands.length, contractors_with_matches: per.size, matches_upserted: made }));
