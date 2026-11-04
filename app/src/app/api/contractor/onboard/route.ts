import { NextResponse } from "next/server";
import { ContractorOnboard } from "@/lib/schemas";
import { adminDb, currentUser, audit } from "@/lib/supabase";
import { attributeSignup, ensureCode, REF_COOKIE } from "@/lib/referrals";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Creates/updates the signed-in user's contractor org + profile. Starts on Free (public bids only). Never grants admin. Idempotent. */
export async function POST(req: Request) {
  if (!rateLimit(`onboard:${clientIp(req)}`, 10, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const u = await currentUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = ContractorOnboard.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) }, { status: 422 });
  const f = p.data; const db = adminDb(); const uid = u.user.id;
  const { data: prof } = await db.from("profiles").select("role").eq("user_id", uid).maybeSingle();
  if (prof?.role === "admin") return NextResponse.json({ error: "admins_cannot_onboard_as_contractor" }, { status: 409 });
  if (!prof) await db.from("profiles").insert({ user_id: uid, role: "contractor", display_name: f.display_name, email_verified_at: u.user.email_confirmed_at ?? null });
  else await db.from("profiles").update({ role: "contractor", display_name: f.display_name }).eq("user_id", uid);
  let { data: org } = await db.from("organizations").select("id").eq("owner_user_id", uid).eq("kind", "contractor").maybeSingle();
  let isNew = false;
  if (!org) { isNew = true; const r = await db.from("organizations").insert({ owner_user_id: uid, business_name: f.business_name, website: f.website || null, kind: "contractor", claim_status: "claimed" }).select("id").single(); if (r.error) return NextResponse.json({ error: "org_failed" }, { status: 500 }); org = r.data; }
  else await db.from("organizations").update({ business_name: f.business_name, website: f.website || null }).eq("id", org.id);
  const { error } = await db.from("contractor_profiles").upsert({ organization_id: org.id, trades: f.trades, zip_codes: f.zip_codes, service_radius: f.service_radius ?? null, statewide: f.statewide, goal: f.goal,
    min_job_value: f.min_job_value ?? null, max_alerts_daily: f.max_alerts_daily, alert_email: f.alert_email ?? u.user.email ?? null, availability_confirmed_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (error) return NextResponse.json({ error: "profile_failed" }, { status: 500 });
  await ensureCode(db, org.id).catch(() => null); // referral code; never blocks onboarding
  const ref = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${REF_COOKIE}=([^;]+)`))?.[1];
  const referred = isNew && ref ? await attributeSignup(db, org.id, decodeURIComponent(ref)).catch(() => false) : false;
  await audit(uid, "contractor_onboarded", "organization", org.id, { trades: f.trades, statewide: f.statewide, terms_accepted_at: new Date().toISOString(), referred });
  return NextResponse.json({ ok: true, organization_id: org.id, plan: "free", next: "/dashboard" });
}
