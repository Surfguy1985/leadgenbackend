import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase";
import { safeNext } from "@/lib/safeNext";
/** Magic-link callback: users without an org go to onboarding; others go to a safe ?next= path or the dashboard. */
export async function GET(req: Request) {
  const url = new URL(req.url); const code = url.searchParams.get("code"); const db = await userDb();
  if (code) await db.auth.exchangeCodeForSession(code);
  const { data } = await db.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", url.origin));
  const { data: orgs } = await db.from("organizations").select("id").limit(1);
  const next = safeNext(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(orgs?.length ? (next ?? "/dashboard") : "/onboarding", url.origin));
}
