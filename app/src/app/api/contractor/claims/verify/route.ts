import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, currentUser, audit } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { approveClaim, checkChallenge } from "@/lib/claims";

export const runtime = "nodejs";
const Body = z.object({ claim_id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
/** Check the domain-email code. Success transfers the unclaimed profile to the claimant (admins can roll back). */
export async function POST(req: Request) {
  if (!rateLimit(`claimv:${clientIp(req)}`, 10, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const s = await currentUser(); if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const db = adminDb();
  const { data: c } = await db.from("profile_claims").select("id,organization_id,claimant_user_id,status,challenge_hash,challenge_expires_at,attempts").eq("id", p.data.claim_id).maybeSingle();
  if (!c || c.claimant_user_id !== s.user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = checkChallenge(c, p.data.code);
  if (r !== "ok") {
    if (r === "wrong_code") await db.from("profile_claims").update({ attempts: c.attempts + 1 }).eq("id", c.id);
    await audit(s.user.id, "profile_claim_code_failed", "organization", c.organization_id, { claim_id: c.id, result: r });
    return NextResponse.json({ error: r, attempts_left: Math.max(0, 4 - c.attempts) }, { status: r === "wrong_code" ? 400 : 410 });
  }
  await db.from("profile_claims").update({ status: "verified", attempts: c.attempts + 1 }).eq("id", c.id);
  try { await approveClaim(db, c.id, "system", "domain_email_verified"); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "approve_failed" }, { status: 409 }); }
  return NextResponse.json({ ok: true, status: "approved", next: "/onboarding?claimed=1" });
}
