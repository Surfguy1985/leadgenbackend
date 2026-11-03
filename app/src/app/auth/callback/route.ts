import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase";
export async function GET(req: Request) {
  const url = new URL(req.url); const code = url.searchParams.get("code");
  if (code) await (await userDb()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
