import { NextResponse } from "next/server";
import { ManageAction } from "@/lib/schemas";
import { adminDb, audit } from "@/lib/supabase";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { hashToken, lifecycleDates } from "@/lib/homeowner";
import { preflight, withCors } from "@/lib/cors";

export const runtime = "nodejs";
const OPEN = ["ingested", "classified", "needs_review", "verified", "published", "matched", "notified", "responded"];

/** Homeowner self-service without an account (RT-21): status / withdraw / close / reconfirm / unlist via hashed manage token. */
export async function POST(req: Request) { return withCors(req, await handle(req)); }
export async function OPTIONS(req: Request) { return preflight(req); }

async function handle(req: Request): Promise<Response> {
  if (!rateLimit(`manage:${clientIp(req)}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const p = ManageAction.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = adminDb();
  const { data: tok } = await db.from("manage_tokens").select("id,opportunity_id,expires_at,revoked_at").eq("token_hash", hashToken(p.data.token)).eq("purpose", "manage").maybeSingle();
  if (!tok || tok.revoked_at || new Date(tok.expires_at) < new Date()) return NextResponse.json({ error: "invalid_or_expired_link" }, { status: 404 });
  const id = tok.opportunity_id;
  const { data: opp } = await db.from("opportunities").select("status,urgency,hide_after,visibility,consent_id,title,city,zip").eq("id", id).single();
  if (!opp) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { count: recipients } = await db.from("lead_access").select("id", { count: "exact", head: true }).eq("opportunity_id", id);
  const open = OPEN.includes(opp.status);
  const actor = "homeowner_manage_link";

  switch (p.data.action) {
    case "status":
      return NextResponse.json({ status: opp.status, open, title: opp.title, city: opp.city, zip: opp.zip, hide_after: opp.hide_after, public: opp.visibility === "public", contractors_shared_with: recipients ?? 0, max_contractors: 5 });
    case "withdraw": { // revokes ALL contractor contact access and closes the request (DB trigger does the cascade)
      await db.from("consents").update({ withdrawn_at: new Date().toISOString() }).eq("opportunity_id", id).is("withdrawn_at", null);
      await db.from("manage_tokens").update({ revoked_at: new Date().toISOString() }).eq("opportunity_id", id).neq("id", tok.id);
      await audit(actor, "homeowner_withdrew", "opportunity", id, { reason: p.data.reason ?? null });
      return NextResponse.json({ ok: true, status: "withdrawn" });
    }
    case "close": {
      if (!open) return NextResponse.json({ ok: true, status: opp.status });
      await db.from("opportunities").update({ status: "cancelled", close_reason: p.data.reason ?? "homeowner_closed" }).eq("id", id);
      await audit(actor, "homeowner_closed", "opportunity", id);
      return NextResponse.json({ ok: true, status: "cancelled" });
    }
    case "reconfirm": {
      if (!open) return NextResponse.json({ error: "closed" }, { status: 409 });
      const d = lifecycleDates((opp.urgency ?? "normal") as "urgent" | "normal" | "recurring");
      await db.from("opportunities").update({ ...d, last_verified_at: new Date().toISOString() }).eq("id", id);
      await audit(actor, "homeowner_reconfirmed", "opportunity", id);
      return NextResponse.json({ ok: true, hide_after: d.hide_after });
    }
    case "unlist": {
      await db.from("consents").update({ withdrawn_at: new Date().toISOString() }).eq("opportunity_id", id).eq("purpose", "public_listing").is("withdrawn_at", null);
      if (opp.visibility === "public") await db.from("opportunities").update({ visibility: "private" }).eq("id", id);
      await audit(actor, "homeowner_unlisted", "opportunity", id);
      return NextResponse.json({ ok: true, public: false });
    }
  }
}
