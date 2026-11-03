import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminDb, audit, requireAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function decide(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  if (!admin) throw new Error("forbidden");
  const id = String(formData.get("id")); const decision = String(formData.get("decision"));
  const oppId = formData.get("opportunity_id") ? String(formData.get("opportunity_id")) : null;
  if (!["approved","rejected"].includes(decision)) throw new Error("bad decision");
  const db = adminDb();
  await db.from("moderation_queue").update({ review_state: decision, reviewer: admin.user.id, decision_at: new Date().toISOString() }).eq("id", id);
  if (oppId) {
    if (decision === "approved") {
      const { data: o } = await db.from("opportunities").select("kind,consent_id,is_test_data").eq("id", oppId).single();
      // private leads stay private (visibility=private); public bids/signals become public listings
      const visibility = o?.kind === "private_lead" || o?.is_test_data ? "private" : "public";
      await db.from("opportunities").update({ status: "published", visibility, verification_status: o?.kind === "private_lead" ? "verified" : "unverified", published_at: new Date().toISOString(), last_verified_at: new Date().toISOString() }).eq("id", oppId);
    } else {
      await db.from("opportunities").update({ status: "rejected", visibility: "internal" }).eq("id", oppId);
    }
  }
  await audit(admin.user.id, `moderation_${decision}`, "moderation_queue", id, { opportunity_id: oppId });
  revalidatePath("/admin");
}

export default async function Admin() {
  if (!(await requireAdmin())) notFound();
  const db = adminDb();
  const [{ data: queue }, { data: failures }, { data: subs }, { data: logs }] = await Promise.all([
    db.from("moderation_queue").select("id,opportunity_id,reason,created_at,details").eq("review_state", "open").order("created_at").limit(100),
    db.from("workflow_failures").select("id,workflow,node,error,state,attempts").neq("state", "resolved").limit(50),
    db.from("subscriptions").select("organization_id,plan,status"),
    db.from("audit_logs").select("actor,action,object_type,object_id,timestamp").order("timestamp", { ascending: false }).limit(30),
  ]);
  return (
    <main>
      <h1>Admin</h1>
      <h2>Moderation queue ({queue?.length ?? 0})</h2>
      {(queue ?? []).map(q => (
        <form key={q.id} action={decide} style={{ borderBottom: "1px solid #ddd", padding: 8 }}>
          <input type="hidden" name="id" value={q.id} /><input type="hidden" name="opportunity_id" value={q.opportunity_id ?? ""} />
          <b>{q.reason}</b> · opp {q.opportunity_id ?? "—"} · {new Date(q.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(q.details, null, 1).slice(0, 800)}</pre>
          <button name="decision" value="approved">Approve</button> <button name="decision" value="rejected">Reject</button>
        </form>))}
      <h2>Workflow failures / dead letters</h2>
      <ul>{(failures ?? []).map(f => <li key={f.id}>{f.workflow}/{f.node}: {f.state} ({f.attempts}) — {f.error?.slice(0, 120)}</li>)}</ul>
      <h2>Subscriptions</h2><ul>{(subs ?? []).map((s, i) => <li key={i}>{s.organization_id}: {s.plan} / {s.status}</li>)}</ul>
      <h2>Recent audit</h2><ul>{(logs ?? []).map((l, i) => <li key={i}>{l.timestamp} {l.actor} {l.action} {l.object_type}:{l.object_id}</li>)}</ul>
    </main>
  );
}
