/** One-off/backfill: run approved intel sources live, then match every published public opportunity to contractor profiles.
 *  Outbound notifications are SUPPRESSED (matches get notification_status='suppressed'; no notifications rows, no email). */
import { adminDb } from "../src/lib/supabase";
import { runDueSources } from "../src/lib/intel/engine";
import { runSamGov } from "../src/lib/connectors/samgov";
import { matchPublicOpportunities } from "../src/lib/autoMatch";

const db = adminDb(); const args = new Set(process.argv.slice(2));
if (!args.has("--match-only")) {
  if (process.env.SAM_GOV_API_KEY) console.log("samgov", JSON.stringify(await runSamGov({ dryRun: false, days: 14, maxPages: 5 }).catch(e => ({ error: String(e).slice(0, 200) }))));
  for (const r of await runDueSources(db, { force: true })) { const { buckets, ...x } = r as any; console.log("intel", JSON.stringify(x)); }
}
console.log("match", JSON.stringify(await matchPublicOpportunities(db)));
