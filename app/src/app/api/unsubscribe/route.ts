import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase";
import { safeEqual } from "@/lib/rateLimit";
import { unsubToken } from "@/lib/monetization";

export const runtime = "nodejs";
/** One-click unsubscribe (CAN-SPAM + RFC 8058 POST). Link: /api/unsubscribe?e=<email>&t=<hmac>. */
async function handle(req: Request) {
  const u = new URL(req.url); const e = (u.searchParams.get("e") ?? "").toLowerCase().trim(); const t = u.searchParams.get("t") ?? "";
  const secret = process.env.SHARED_SECRET;
  if (!secret || !e || !safeEqual(t, unsubToken(e, secret))) return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  await adminDb().from("email_suppressions").upsert({ email: e, reason: "unsubscribe" });
  await adminDb().from("claim_reminders").update({ status: "skipped" }).eq("email", e).eq("status", "queued");
  return new NextResponse("<!doctype html><title>Unsubscribed</title><p style='font-family:system-ui;padding:40px'>You're unsubscribed. Crewforthat won't email this address again.</p>", { headers: { "content-type": "text/html" } });
}
export const GET = handle; export const POST = handle;
