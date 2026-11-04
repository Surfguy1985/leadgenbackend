import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { userDb } from "@/lib/supabase";
import { safeNext } from "@/lib/safeNext";

const OTP_TYPES = new Set(["email", "magiclink", "signup", "invite", "recovery", "email_change"]);
/**
 * Magic-link callback. Supports both link styles:
 *  - PKCE `?code=` (default {{ .ConfirmationURL }} template; only works in the SAME browser that requested the link)
 *  - `?token_hash=&type=` (recommended template; works on any device / email app browser)
 * Failures go back to /login with a reason instead of failing silently.
 */
export async function GET(req: Request) {
  const url = new URL(req.url); const db = await userDb();
  const code = url.searchParams.get("code"); const tokenHash = url.searchParams.get("token_hash"); const type = url.searchParams.get("type") ?? "email";
  const next = safeNext(url.searchParams.get("next"));
  const fail = (reason: string) => { const l = new URL("/login", url.origin); l.searchParams.set("error", reason); if (next) l.searchParams.set("next", next); return NextResponse.redirect(l); };
  const upstream = url.searchParams.get("error_code") || url.searchParams.get("error");
  if (upstream) return fail(upstream === "otp_expired" ? "expired" : "link_invalid");
  if (tokenHash && OTP_TYPES.has(type)) {
    const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (error) return fail(/expired/i.test(error.message) ? "expired" : "link_invalid");
  } else if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) return fail(/verifier/i.test(error.message) ? "other_browser" : /expired/i.test(error.message) ? "expired" : "link_invalid");
  }
  const { data } = await db.auth.getUser();
  if (!data.user) return fail("no_session");
  const { data: orgs } = await db.from("organizations").select("id").limit(1);
  return NextResponse.redirect(new URL(orgs?.length ? (next ?? "/dashboard") : "/onboarding", url.origin));
}
