import { NextResponse } from "next/server";
import { adminDb, currentUser, audit } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
/** Upload one proof file (PDF/PNG/JPG, max 5 MB) to the private claim-proofs bucket for an open review claim. */
export async function POST(req: Request) {
  if (!rateLimit(`claimp:${clientIp(req)}`, 5, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const s = await currentUser(); if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null); const file = form?.get("file"); const claimId = String(form?.get("claim_id") ?? "");
  if (!(file instanceof File) || !TYPES[file.type] || file.size > 5_000_000 || !/^[0-9a-f-]{36}$/.test(claimId)) return NextResponse.json({ error: "invalid_file" }, { status: 422 });
  const db = adminDb();
  const { data: c } = await db.from("profile_claims").select("id,organization_id,claimant_user_id,status").eq("id", claimId).maybeSingle();
  if (!c || c.claimant_user_id !== s.user.id || !["pending", "disputed"].includes(c.status)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const path = `${c.id}/${Date.now()}.${TYPES[file.type]}`;
  const up = await db.storage.from("claim-proofs").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) return NextResponse.json({ error: "upload_failed" }, { status: 503 });
  await db.from("profile_claims").update({ proof_path: path }).eq("id", c.id);
  await audit(s.user.id, "profile_claim_proof_uploaded", "organization", c.organization_id, { claim_id: c.id, bytes: file.size, type: file.type });
  return NextResponse.json({ ok: true });
}
