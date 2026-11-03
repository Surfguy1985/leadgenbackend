// STAGING ONLY. Loads clearly labeled fake data (spec Phase B: "never public").
// Every row: is_test_data=true, title prefixed "[TEST]", visibility private/internal, example.com emails.
// Usage: APP_ENV=staging SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:staging
import { createClient } from "@supabase/supabase-js";

if (process.env.APP_ENV !== "staging") { console.error("Refusing: APP_ENV must be 'staging'."); process.exit(1); }
const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (/prod/i.test(url) && !process.env.I_KNOW_THIS_IS_STAGING) { console.error("URL looks like production; refusing."); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

// 10 sample trades across DFW (spec Phase B)
const SAMPLES: [string, string, string, string, string][] = [
  ["landscaping", "lawn_care", "Frisco", "75034", "Weekly mowing + edging, quarter-acre lot"],
  ["landscaping", "irrigation", "Plano", "75024", "Sprinkler zone 3 not turning on"],
  ["residential_repair", "painting", "Dallas", "75214", "Interior repaint, 3 bedrooms"],
  ["residential_repair", "plumbing", "Richardson", "75080", "Leaking water heater, needs licensed plumber"],
  ["residential_repair", "roofing", "Arlington", "76010", "Hail damage inspection"],
  ["cleaning", "move_out", "Irving", "75039", "Move-out clean, 2BR apartment"],
  ["cleaning", "post_construction", "McKinney", "75070", "Post-construction clean, new build"],
  ["multifamily", "make_ready", "Fort Worth", "76107", "Make-ready for 6 units/month"],
  ["multifamily", "resurfacing", "Garland", "75040", "Tub/countertop resurfacing, 12 units"],
  ["commercial_construction", "tenant_improvement", "Denton", "76201", "Small office TI, 2,000 sq ft"],
];

const { data: src } = await db.from("sources").upsert({ name: "[TEST] Staging seed", kind: "direct", active: false, reuse_allowed: false, permission_scope: "test_data_only" }, { onConflict: "name" }).select("id").single();
let n = 0;
for (const [i, [trade, sub, city, zip, desc]] of SAMPLES.entries()) {
  const { data: opp, error } = await db.from("opportunities").upsert({
    kind: "private_lead", title: `[TEST] ${desc}`.slice(0, 120), summary: `[TEST DATA — not a real request] ${desc}`, trade, subtrades: [sub],
    property_type: trade === "multifamily" ? "multifamily" : trade === "commercial_construction" ? "commercial" : "residential",
    city, zip, source_id: src!.id, source_record_id: `seed-${i + 1}`, submission_id: `seed-${i + 1}`,
    status: "needs_review", visibility: "internal", verification_status: "pending", is_test_data: true,
  }, { onConflict: "submission_id" }).select("id").single();
  if (error) { console.error(error.message); continue; }
  await db.from("lead_contacts").upsert({ opportunity_id: opp.id, contact_name: `Test Requester ${i + 1}`, email: `test+${i + 1}@example.com`, phone: "555-0100" }, { onConflict: "opportunity_id" });
  n++;
}
console.log(`Seeded ${n} [TEST] opportunities (internal, never public).`);
