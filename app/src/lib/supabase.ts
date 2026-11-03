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
