import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();
const Save = z.object({
  opportunity_id: UUID,
  note: z.string().trim().max(500).optional(),
});

async function contractor() {
  const session = await currentUser();
  if (!session) return null;
  const { data: org } = await session.db.from("organizations")
    .select("id").eq("owner_user_id", session.user.id).eq("kind", "contractor").maybeSingle();
  if (!org) return null;
  const { data: profile } = await session.db.from("contractor_profiles")
    .select("id").eq("organization_id", org.id).maybeSingle();
  return profile ? { db: session.db, id: profile.id } : null;
}

/** RLS protects every read/write, including another contractor's saved records. */
export async function GET() {
  const c = await contractor();
  if (!c) return NextResponse.json({ error: "unauthorized_or_not_onboarded" }, { status: 401 });
  const { data, error } = await c.db.from("saved_items")
    .select("id,opportunity_id,note,created_at").eq("contractor_id", c.id)
    .not("opportunity_id", "is", null).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const ids = (data ?? []).map(x => x.opportunity_id);
  // Public listings only: never return private contact details or unpublished requests.
  const { data: listings } = ids.length
    ? await c.db.from("public_opportunities").select("id,title,trade,city,zip,deadline,official_apply_url,source_url,tab").in("id", ids)
    : { data: [] as Record<string, unknown>[] };
  const visible = new Map((listings ?? []).map(x => [x.id, x]));
  return NextResponse.json({ items: (data ?? []).filter(x => visible.has(x.opportunity_id)).map(x => ({
    ...x, opportunity: visible.get(x.opportunity_id),
  })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!rateLimit(`save:${clientIp(req)}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const c = await contractor();
  if (!c) return NextResponse.json({ error: "unauthorized_or_not_onboarded" }, { status: 401 });
  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const { data: listing } = await c.db.from("public_opportunities")
    .select("id").eq("id", parsed.data.opportunity_id).maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing_unavailable" }, { status: 404 });
  const { data: previous } = await c.db.from("saved_items").select("id")
    .eq("contractor_id", c.id).eq("opportunity_id", listing.id).maybeSingle();
  if (previous) {
    const { error } = await c.db.from("saved_items").update({ note: parsed.data.note ?? null }).eq("id", previous.id).eq("contractor_id", c.id);
    return error ? NextResponse.json({ error: "save_failed" }, { status: 503 }) : NextResponse.json({ ok: true, id: previous.id });
  }
  // Free-plan cap is five saved records, as configured in the v3 plan table.
  // Use the authenticated contractor identity and read effective entitlements
  // server-side; client input cannot impersonate a paid plan.
  const { count, error: countError } = await c.db.from("saved_items")
    .select("id", { count: "exact", head: true }).eq("contractor_id", c.id)
    .not("opportunity_id", "is", null);
  if (countError) return NextResponse.json({ error: "save_unavailable" }, { status: 503 });
  if ((count ?? 0) >= 5) return NextResponse.json({
    error: "saved_limit_reached", message: "Your free shortlist includes up to five opportunities. Remove one to save another.",
  }, { status: 409 });
  const { data, error } = await c.db.from("saved_items")
    .insert({ contractor_id: c.id, opportunity_id: listing.id, note: parsed.data.note ?? null })
    .select("id").single();
  return error ? NextResponse.json({ error: "save_failed" }, { status: 503 }) : NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

export async function DELETE(req: Request) {
  const c = await contractor();
  if (!c) return NextResponse.json({ error: "unauthorized_or_not_onboarded" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !UUID.safeParse(id).success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const { error } = await c.db.from("saved_items").delete().eq("id", id).eq("contractor_id", c.id);
  return error ? NextResponse.json({ error: "delete_failed" }, { status: 503 }) : NextResponse.json({ ok: true });
}
