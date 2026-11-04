import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { matchAndNotify } from "@/lib/workflows";
import { adminDb, audit, requireRole, adminAction, type AdminRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function decide(formData: FormData) {
  "use server";
  const admin = await requireRole(["owner", "content_admin", "support_agent"]);
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
      after(() => matchAndNotify(oppId)); // WF-04 in-app: match + notify (idempotent, retried by daily sweep)
    } else {
      await db.from("opportunities").update({ status: "rejected", visibility: "internal" }).eq("id", oppId);
    }
  }
  await adminAction(admin.user.id, `moderation_${decision}`, "moderation_queue", id, String(formData.get("reason") ?? "") || null, { opportunity_id: oppId });
  await audit(admin.user.id, `moderation_${decision}`, "moderation_queue", id, { opportunity_id: oppId });
  revalidatePath("/admin");
}

async function toggleSource(formData: FormData) {
  "use server";
  const admin = await requireRole(["owner", "content_admin"]); if (!admin) throw new Error("forbidden");
  const id = String(formData.get("id")); const enabled = formData.get("enabled") === "true";
  const reason = String(formData.get("reason") ?? "").trim(); if (reason.length < 5) throw new Error("reason required");
  await adminDb().from("sources").update({ enabled }).eq("id", id);
  await adminAction(admin.user.id, enabled ? "source_enable" : "source_disable", "source", id, reason, { enabled });
  revalidatePath("/admin");
}

const ct = (t: string) => new Date(t).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT";
const can = (roles: Set<AdminRole>, r: AdminRole[]) => r.some(x => roles.has(x));

export default async function Admin() {
  const me = await requireRole(["owner", "finance_admin", "content_admin", "support_agent", "auditor_readonly"]);
  if (!me) notFound();
  const R = me.roles; const db = adminDb(); const none = Promise.resolve({ data: null as null | Record<string, any>[] });
  const ops = can(R, ["owner", "content_admin", "support_agent", "auditor_readonly"]);
  const content = can(R, ["owner", "content_admin", "auditor_readonly"]);
  const fin = can(R, ["owner", "finance_admin", "auditor_readonly"]);
  const writeMod = can(R, ["owner", "content_admin", "support_agent"]); const writeSrc = can(R, ["owner", "content_admin"]);
  const [{ data: queue }, { data: failures }, { data: subs }, { data: logs }, { data: sources }, { data: runs }, { data: plans }, { data: ledger }, { data: actions }, { data: ai }] = await Promise.all([
    ops ? db.from("moderation_queue").select("id,opportunity_id,reason,priority,case_type,created_at,details").eq("review_state", "open").order("priority").order("created_at").limit(100) : none,
    ops ? db.from("workflow_failures").select("id,workflow,node,error,state,attempts").neq("state", "resolved").limit(50) : none,
    fin ? db.from("subscriptions").select("organization_id,plan_code,status,trial_end,current_period_end") : none,
    can(R, ["owner", "auditor_readonly"]) ? db.from("audit_logs").select("actor,action,object_type,object_id,timestamp").order("timestamp", { ascending: false }).limit(30) : none,
    content ? db.from("sources").select("id,name,enabled,allowed_hostnames") : none,
    content ? db.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(15) : none,
    fin ? db.from("plans").select("code,name,monthly_price_cents,trial_days,stripe_price_id,purchasable,visible").order("sort") : none,
    fin ? db.from("billing_ledger").select("kind,amount_cents,currency,organization_id,occurred_at").order("occurred_at", { ascending: false }).limit(30) : none,
    can(R, ["owner", "auditor_readonly"]) ? db.from("admin_actions").select("actor,action,object_type,object_id,reason,created_at").order("created_at", { ascending: false }).limit(30) : none,
    can(R, ["owner", "auditor_readonly"]) ? db.from("ai_usage").select("function_name,ok,cost_usd,created_at").order("created_at", { ascending: false }).limit(200) : none,
  ]);
  const aiCost = (ai ?? []).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0); const aiFail = (ai ?? []).filter(r => !r.ok).length;
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1>Crewforthat admin</h1>
      <p>Roles: {[...R].join(", ")}</p>
      {ops && <><h2>Moderation queue ({queue?.length ?? 0})</h2>
      {(queue ?? []).map(q => (
        <form key={q.id} action={decide} style={{ borderBottom: "1px solid #ddd", padding: 8 }}>
          <input type="hidden" name="id" value={q.id} /><input type="hidden" name="opportunity_id" value={q.opportunity_id ?? ""} />
          <b>[{q.priority}] {q.case_type}: {q.reason}</b> · opp {q.opportunity_id ?? "—"} · {ct(q.created_at)}
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(q.details, null, 1).slice(0, 800)}</pre>
          {writeMod && <><input name="reason" placeholder="note (optional)" /> <button name="decision" value="approved">Approve</button> <button name="decision" value="rejected">Reject</button></>}
        </form>))}
      <h2>Workflow failures / dead letters</h2>
      <ul>{(failures ?? []).map(f => <li key={f.id}>{f.workflow}/{f.node}: {f.state} ({f.attempts}) — {String(f.error ?? "").slice(0, 120)}</li>)}</ul></>}
      {content && <><h2>Sources</h2>
      <table><tbody>{(sources ?? []).map(s => <tr key={s.id}><td>{s.name}</td><td>{(s.allowed_hostnames ?? []).join(", ")}</td><td>{s.enabled ? "enabled" : "disabled"}</td>
        <td>{writeSrc && <form action={toggleSource}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="enabled" value={String(!s.enabled)} /><input name="reason" placeholder="reason (required)" required minLength={5} /> <button>{s.enabled ? "Disable" : "Enable"}</button></form>}</td></tr>)}</tbody></table>
      <h2>Recent ingestion runs</h2><pre style={{ fontSize: 12 }}>{JSON.stringify(runs ?? [], null, 1).slice(0, 3000)}</pre></>}
      {fin && <><h2>Plans</h2><ul>{(plans ?? []).map(p => <li key={p.code}>{p.name} ${(p.monthly_price_cents / 100).toFixed(2)} · trial {p.trial_days}d · price {p.stripe_price_id ? "set" : "MISSING"} · {p.purchasable ? "purchasable" : "hidden"}</li>)}</ul>
      <h2>Subscriptions</h2><ul>{(subs ?? []).map((s, i) => <li key={i}>{s.organization_id}: {s.plan_code} / {s.status}{s.trial_end ? ` · trial ends ${ct(s.trial_end)}` : ""}</li>)}</ul>
      <h2>Billing ledger</h2><ul>{(ledger ?? []).map((l, i) => <li key={i}>{ct(l.occurred_at)} {l.kind} {(l.amount_cents / 100).toFixed(2)} {l.currency} · {l.organization_id ?? "—"}</li>)}</ul></>}
      {can(R, ["owner", "auditor_readonly"]) && <><h2>AI usage (last 200)</h2><p>cost ${aiCost.toFixed(4)} · failures {aiFail}</p>
      <h2>Admin actions</h2><ul>{(actions ?? []).map((a, i) => <li key={i}>{ct(a.created_at)} {a.actor} {a.action} {a.object_type}:{a.object_id} {a.reason ? `— ${a.reason}` : ""}</li>)}</ul>
      <h2>Recent audit</h2><ul>{(logs ?? []).map((l, i) => <li key={i}>{l.timestamp} {l.actor} {l.action} {l.object_type}:{l.object_id}</li>)}</ul></>}
    </main>
  );
}
