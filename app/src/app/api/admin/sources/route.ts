import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, currentUser, audit } from "@/lib/supabase";

async function requireRole(roles: string[]) {
  const u = await currentUser(); if (!u) return null;
  const { data } = await u.db.rpc("has_admin_role", { roles }); return data === true ? u : null;
}

/** Source registry: list sources with current rights + health (owner/content/auditor). */
export async function GET() {
  if (!await requireRole(["owner", "content_admin", "auditor_readonly"])) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = adminDb();
  const { data: sources, error } = await db.from("sources").select("id,name,kind,source_type,base_domain,allowed_hostnames,enabled,emergency_paused,terms_url,owner,refresh_interval,current_rights_id,source_rights!sources_current_rights_fk(approval_version,can_fetch,can_store_raw,can_publish_summary,can_export,can_resell,expires_at,review_due_at),connector_health(last_success_at,consecutive_failures,last_error)").order("name");
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  return NextResponse.json({ sources });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), name: z.string().min(2).max(120), source_type: z.enum(["api", "feed", "download", "official_web", "partner", "direct"]), base_domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i), allowed_hostnames: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)).min(1).max(10), terms_url: z.string().url().optional(), owner: z.string().max(120).optional() }),
  z.object({ action: z.literal("emergency_pause"), source_id: z.string().uuid(), paused: z.boolean(), reason: z.string().min(3).max(300) }),
]);

/** register: creates a DISABLED source with no rights (fail-closed). Rights approval is a separate, versioned owner step.
 *  emergency_pause: any content admin can pause instantly; unpausing needs owner. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const b = parsed.data; const db = adminDb();
  if (b.action === "register") {
    const u = await requireRole(["owner", "content_admin"]); if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { data, error } = await db.from("sources").insert({ name: b.name, kind: b.source_type === "direct" ? "direct" : "official_api", source_type: b.source_type, base_domain: b.base_domain.toLowerCase(), allowed_hostnames: b.allowed_hostnames.map(h => h.toLowerCase()), terms_url: b.terms_url, owner: b.owner, enabled: false }).select("id").single();
    if (error) return NextResponse.json({ error: "insert_failed" }, { status: 400 });
    await audit(u.user.id, "source_registered", "source", data.id, { name: b.name });
    return NextResponse.json({ id: data.id, enabled: false, rights: "none (deny by default)" }, { status: 201 });
  }
  const u = await requireRole(b.paused ? ["owner", "content_admin"] : ["owner"]); if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { error } = await db.from("sources").update({ emergency_paused: b.paused }).eq("id", b.source_id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 400 });
  await audit(u.user.id, b.paused ? "source_emergency_paused" : "source_unpaused", "source", b.source_id, { reason: b.reason });
  return NextResponse.json({ ok: true });
}
