import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

/** Service-role client: bypasses RLS. Server routes only, never shipped to the browser. */
export function adminDb(): SupabaseClient {
  return createClient(env.supabaseUrl(), env.supabaseService(), { auth: { persistSession: false } });
}

/** Per-request client acting as the signed-in user (RLS enforced). */
export async function userDb(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC */ } },
    },
  });
}

export async function currentUser() {
  const db = await userDb();
  const { data } = await db.auth.getUser();
  return data.user ? { user: data.user, db } : null;
}

export async function requireAdmin() {
  const u = await currentUser();
  if (!u) return null;
  const { data } = await adminDb().from("profiles").select("role").eq("user_id", u.user.id).maybeSingle();
  return data?.role === "admin" ? u : null;
}

export async function audit(actor: string, action: string, objectType: string, objectId?: string, metadata: Record<string, unknown> = {}) {
  await adminDb().from("audit_logs").insert({ actor, action, object_type: objectType, object_id: objectId ?? null, metadata });
}

export type AdminRole = "owner" | "finance_admin" | "content_admin" | "support_agent" | "auditor_readonly";
/** Role-based admin check (admin_roles). Legacy profiles.role='admin' counts as owner. Returns null if none of `allowed` held. */
export async function requireRole(allowed: AdminRole[]) {
  const u = await currentUser(); if (!u) return null;
  const db = adminDb();
  const [{ data: rows }, { data: prof }] = await Promise.all([
    db.from("admin_roles").select("role").eq("user_id", u.user.id),
    db.from("profiles").select("role").eq("user_id", u.user.id).maybeSingle(),
  ]);
  const roles = new Set<AdminRole>((rows ?? []).map(r => r.role as AdminRole));
  if (prof?.role === "admin") roles.add("owner");
  return allowed.some(r => roles.has(r)) ? { ...u, roles } : null;
}

/** Writes to admin_actions (append-only). */
export async function adminAction(actor: string, action: string, objectType: string, objectId: string | null, reason: string | null, diff: Record<string, unknown> = {}) {
  await adminDb().from("admin_actions").insert({ actor, action, object_type: objectType, object_id: objectId, reason, diff });
}
