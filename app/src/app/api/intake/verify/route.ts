import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, audit } from "@/lib/supabase";
import { safeEqual, clientIp, rateLimit } from "@/lib/rateLimit";
import { verifyToken } from "@/lib/scope";

export const runtime = "nodejs";

/** Email-confirmation link (sent by WF-01). Marks the request email-verified; it still goes to moderation before publishing. */
export async function GET(req: Request) {
  if (!rateLimit(`verify:${clientIp(req)}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const url = new URL(req.url);
  const id = z.string().uuid().safeParse(url.searchParams.get("id"));
  const t = url.searchParams.get("t") ?? "";
  if (!id.success || !safeEqual(t, verifyToken(id.data))) return NextResponse.json({ error: "invalid_link" }, { status: 400 });
  const db = adminDb();
  const { data } = await db.from("opportunities").update({ verification_status: "verified", last_verified_at: new Date().toISOString() })
    .eq("id", id.data).in("status", ["ingested","classified","needs_review"]).select("id");
  if (data?.length) {
    await db.from("moderation_queue").insert({ opportunity_id: id.data, reason: "email_verified_ready_for_approval" });
    await audit("requester", "email_verified", "opportunity", id.data);
  }
  // WEBFLOW_ORIGIN is a comma-separated CORS allow-list, not a redirect URL.
  // Prefer the live Webflow hostname and the actual published confirmation slug.
  const origins = (process.env.WEBFLOW_ORIGIN ?? "").split(",").map(o => o.trim()).filter(Boolean);
  const publicWebflowOrigin = origins.find(o => o.endsWith(".webflow.io")) ?? origins[0] ?? process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  return NextResponse.redirect(new URL("/post-job-confirmed", publicWebflowOrigin), 303);
}
