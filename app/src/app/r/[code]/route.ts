import { NextResponse } from "next/server";
import { normCode, REF_COOKIE } from "@/lib/referrals";
/** Referral landing: remember the code for 30 days, then send the visitor to sign in (and on to onboarding). */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = normCode((await ctx.params).code);
  const res = NextResponse.redirect(new URL("/login?next=%2Fonboarding", req.url));
  if (code) res.cookies.set(REF_COOKIE, code, { maxAge: 60 * 60 * 24 * 30, httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  return res;
}
