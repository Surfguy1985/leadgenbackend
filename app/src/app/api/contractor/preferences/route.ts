import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Settings = z.object({
  frequency: z.enum(["off", "daily", "weekly"]),
  tabs: z.array(z.enum(["jobs_now", "upcoming", "buyers"])).min(1).max(3),
  marketing_optin: z.boolean(),
  language: z.enum(["en", "es"]).default("en"),
});

async function contractor() {
  const u = await currentUser();
  if (!u) return null;
  const { data: org } = await u.db.from("organizations").select("id").eq("owner_user_id", u.user.id).eq("kind", "contractor").maybeSingle();
  if (!org) return null;
  const { data: profile } = await u.db.from("contractor_profiles").select("id").eq("organization_id", org.id).maybeSingle();
  return profile ? { db: u.db, id: profile.id } : null;
}

export async function GET() {
  const u = await contractor();
  if (!u) return NextResponse.json({ error: "unauthorized_or_not_onboarded" }, { status: 401 });
  const { data, error } = await u.db.from("alerts_preferences").select("frequency,tabs,language,marketing_optin,unsubscribed_at")
    .eq("contractor_id", u.id).maybeSingle();
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ preferences: data ?? { frequency: "weekly", tabs: ["jobs_now"], language: "en", marketing_optin: false } },
    { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request) {
  if (!rateLimit(`preferences:${clientIp(req)}`, 12, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const u = await contractor();
  if (!u) return NextResponse.json({ error: "unauthorized_or_not_onboarded" }, { status: 401 });
  const parsed = Settings.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map(x => x.message) }, { status: 422 });
  const p = parsed.data;
  const { error } = await u.db.from("alerts_preferences").upsert({
    contractor_id: u.id, frequency: p.frequency, tabs: p.tabs, language: p.language,
    marketing_optin: p.marketing_optin, unsubscribed_at: p.frequency === "off" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "contractor_id" });
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
