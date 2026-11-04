import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminDb, requireRole, adminAction } from "@/lib/supabase";
import { runSource } from "@/lib/intel/engine";
import { LABEL_TEXT, type Label } from "@/lib/quality";

export const dynamic = "force-dynamic";
const OWNER = ["owner", "content_admin"] as const;

async function sourceAction(fd: FormData) {
  "use server";
  const a = await requireRole([...OWNER]); if (!a) throw new Error("forbidden");
  const id = String(fd.get("id")); const op = String(fd.get("op")); const db = adminDb();
  const { data: s } = await db.from("sources").select("*").eq("id", id).single();
  if (op === "enable" && s.rights_decision !== "approved") throw new Error("rights not approved");
  const patch: Record<string, unknown> =
    op === "enable" ? { enabled: true, emergency_paused: false } : op === "pause" ? { emergency_paused: true } :
    op === "live" ? { dry_run: false } : op === "dry" ? { dry_run: true } :
    op === "schedule" ? { refresh_schedule: String(fd.get("schedule")) } : {};
  if (Object.keys(patch).length) await db.from("sources").update(patch).eq("id", id);
  if (op === "sync") after(async () => { await runSource(db, { ...s }, { force: true }); });
  await adminAction(a.user.id, `source_${op}`, "source", id, String(fd.get("schedule") ?? op));
  revalidatePath("/admin/data-ops");
}
async function addSource(fd: FormData) {
  "use server";
  const a = await requireRole([...OWNER]); if (!a) throw new Error("forbidden");
  const name = String(fd.get("name")).trim(); const url = String(fd.get("url")).trim();
  if (name.length < 3 || !/^https:\/\//.test(url)) throw new Error("name + https url required");
  // New sources start pending rights review, disabled, dry-run, non-redistributable.
  const { data } = await adminDb().from("sources").insert({ name, kind: "official_api", base_url: new URL(url).origin, source_url: url, source_type: "api", rights_decision: "pending", rights_reason: String(fd.get("notes") ?? ""), refresh_schedule: "manual" }).select("id").single();
  await adminAction(a.user.id, "source_add", "source", data?.id ?? name, url); revalidatePath("/admin/data-ops");
}
async function reviewRecord(fd: FormData) {
  "use server";
  const a = await requireRole([...OWNER, "support_agent"]); if (!a) throw new Error("forbidden");
  const id = String(fd.get("id")); const d = String(fd.get("d")); const note = String(fd.get("note") ?? "").trim();
  if (!["rejected", "archived"].includes(d) || note.length < 3) throw new Error("reason required");
  // Admins can reject/archive; publishing still requires the record to pass gates + threshold on its next scored run (no manual override of gates).
  await adminDb().from("intel_records").update({ status: d, reviewed_by: a.user.id, reviewed_at: new Date().toISOString(), review_note: note }).eq("id", id);
  await adminAction(a.user.id, `intel_${d}`, "intel_record", id, note); revalidatePath("/admin/data-ops");
}
async function saveSettings(fd: FormData) {
  "use server";
  const a = await requireRole(["owner"]); if (!a) throw new Error("forbidden");
  const n = (k: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(fd.get(k)) || 0)));
  const coupon = String(fd.get("coupon") ?? "").trim();
  const rows = [
    { key: "quality_threshold", value: { publish: n("threshold", 50, 100) } },
    { key: "founding_offer", value: { slots: n("slots", 0, 1000), percent_off: n("pct", 0, 90), stripe_coupon: /^[A-Za-z0-9_-]{3,60}$/.test(coupon) ? coupon : null } },
    { key: "priority_slots", value: { per_city_trade: n("priority", 0, 50) } },
  ];
  for (const r of rows) await adminDb().from("app_settings").upsert({ ...r, updated_by: a.user.id, updated_at: new Date().toISOString() });
  await adminAction(a.user.id, "settings_update", "app_settings", "monetization_quality", JSON.stringify(rows)); revalidatePath("/admin/data-ops");
}

const cnt = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
export default async function DataOps() {
  const a = await requireRole([...OWNER, "support_agent"]); if (!a) notFound();
  const db = adminDb(); const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: sources }, { data: health }, { data: recs }, { data: review }, { data: settings }, { data: subs }, { data: plans }] = await Promise.all([
    db.from("sources").select("id,name,connector,rights_decision,rights_reason,enabled,emergency_paused,dry_run,refresh_schedule,last_successful_sync,error_status,allowed_redistribution,trust_tier,personal_data_restrictions").order("name"),
    db.from("ingestion_runs").select("source_id,status,new_count,started_at,error").order("started_at", { ascending: false }).limit(60),
    db.from("intel_records").select("source_id,record_type,label,status,score,gate_failures").limit(20000),
    db.from("intel_records").select("id,record_type,label,score,gate_failures,fields,fetched_at").eq("status", "review").order("score", { ascending: false }).limit(40),
    db.from("app_settings").select("key,value").in("key", ["quality_threshold", "founding_offer", "priority_slots"]),
    db.from("subscriptions").select("plan_code,status"),
    db.from("plans").select("code,monthly_price_cents"),
  ]);
  const S = new Map((settings ?? []).map((r: any) => [r.key, r.value]));
  const R = recs ?? []; const buckets = [0, 0, 0, 0, 0]; const gates = new Map<string, number>(); const labels = new Map<string, number>();
  for (const r of R) { buckets[Math.min(4, Math.floor(r.score / 20))]++; labels.set(r.label, (labels.get(r.label) ?? 0) + 1); for (const g of r.gate_failures ?? []) { const k = g.split("(")[0]; gates.set(k, (gates.get(k) ?? 0) + 1); } }
  const ev = (e: string) => cnt(db.from("funnel_events").select("id", { count: "exact", head: true }).eq("event", e).gte("created_at", since30));
  const [views, starts, verified, trials, paid, discovered, claimed, listed, founding, priority] = await Promise.all([ev("view"), ev("claim_start"), ev("verified"), ev("trial"), ev("paid"),
    cnt(db.from("organizations").select("id", { count: "exact", head: true }).not("entity_key", "is", null)),
    cnt(db.from("organizations").select("id", { count: "exact", head: true }).eq("claim_status", "claimed")),
    cnt(db.from("organizations").select("id", { count: "exact", head: true }).eq("is_directory_listed", true)),
    cnt(db.from("founding_members").select("organization_id", { count: "exact", head: true })),
    cnt(db.from("priority_slots").select("organization_id", { count: "exact", head: true }))]);
  const price = new Map((plans ?? []).map((p: any) => [p.code, p.monthly_price_cents]));
  const active = (subs ?? []).filter((s: any) => s.status === "active"); const mrr = active.reduce((t: number, s: any) => t + (price.get(s.plan_code) ?? 0), 0) / 100;
  const trialing = (subs ?? []).filter((s: any) => s.status === "trialing").length;
  const byName = new Map((sources ?? []).map((s: any) => [s.id, s.name]));
  const lastRun = new Map<string, any>(); for (const h of health ?? []) if (!lastRun.has(h.source_id)) lastRun.set(h.source_id, h);
  const perSource = new Map<string, { total: number; pub: number }>(); for (const r of R) { const x = perSource.get(r.source_id) ?? { total: 0, pub: 0 }; x.total++; if (r.status === "published") x.pub++; perSource.set(r.source_id, x); }
  const fo = S.get("founding_offer") ?? {}; const th = S.get("quality_threshold")?.publish ?? 80;
  return <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 1200, margin: "0 auto", color: "#25223D" }}>
    <h1>Data Operations</h1><p><a href="/admin">← Admin</a></p>
    <section><h2>Revenue and claim funnel (last 30 days)</h2>
      <table><tbody><tr><td>Listing views</td><td>{views}</td><td>Claim starts</td><td>{starts}</td><td>Verified</td><td>{verified}</td><td>Trials started</td><td>{trials}</td><td>Paid events</td><td>{paid}</td></tr>
      <tr><td>Active paid subs</td><td>{active.length}</td><td>Trialing now</td><td>{trialing}</td><td>MRR</td><td>${mrr.toFixed(2)}</td><td>Founding seats used</td><td>{founding}</td><td>Priority slots used</td><td>{priority}</td></tr></tbody></table></section>
    <section><h2>Contractor network</h2><p>Discovered {discovered} · Directory-listed {listed} · Claimed {claimed} · Claim rate {discovered ? ((claimed / discovered) * 100).toFixed(1) : "0"}%</p></section>
    <section><h2>Quality (publish threshold {th})</h2>
      <p>Score distribution: {buckets.map((b, i) => `${i * 20}–${i * 20 + 19}${i === 4 ? "+" : ""}: ${b}`).join(" · ")}</p>
      <p>Labels: {[...labels].map(([k, v]) => `${LABEL_TEXT[k as Label] ?? k}: ${v}`).join(" · ") || "none yet"}</p>
      <p>Top rejection reasons: {[...gates].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => `${k} (${v})`).join(" · ") || "none"}</p></section>
    <section><h2>Sources: coverage, freshness, rights</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th align="left">Source</th><th>Rights</th><th>State</th><th>Records (published)</th><th>Last sync</th><th>Last run</th><th>Schedule</th><th>Actions</th></tr></thead><tbody>
      {(sources ?? []).map((s: any) => { const lr = lastRun.get(s.id); const ps = perSource.get(s.id); return <tr key={s.id} style={{ borderTop: "1px solid #eee" }}>
        <td><b>{s.name}</b><br /><small>{s.personal_data_restrictions}</small></td>
        <td title={s.rights_reason ?? ""}>{s.rights_decision}{s.allowed_redistribution ? " · redistributable" : " · no redistribution"}</td>
        <td>{s.emergency_paused ? "paused" : s.enabled ? (s.dry_run ? "enabled · dry-run" : "live") : "off"}{s.error_status ? ` · ⚠ ${s.error_status}` : ""}</td>
        <td>{ps ? `${ps.total} (${ps.pub})` : "0"}</td><td>{s.last_successful_sync?.slice(0, 16).replace("T", " ") ?? "never"}</td><td>{lr ? `${lr.status} · ${lr.new_count ?? 0}` : "-"}</td>
        <td><form action={sourceAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="op" value="schedule" /><select name="schedule" defaultValue={s.refresh_schedule}>{["hourly", "6h", "daily", "weekly", "manual"].map(x => <option key={x}>{x}</option>)}</select><button>Set</button></form></td>
        <td>{["enable", "pause", "sync", s.dry_run ? "live" : "dry"].map(op => <form key={op} action={sourceAction} style={{ display: "inline" }}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="op" value={op} /><button disabled={op === "enable" && s.rights_decision !== "approved"}>{op === "live" ? "go live" : op === "dry" ? "dry-run" : op}</button></form>)}</td></tr>; })}
      </tbody></table>
      <form action={addSource} style={{ marginTop: 12 }}><b>Add source</b> (starts pending rights review, off, dry-run): <input name="name" placeholder="Name" required /> <input name="url" placeholder="https://…" required /> <input name="notes" placeholder="Terms / notes" /> <button>Add</button></form></section>
    <section><h2>Review queue (highest score first)</h2>
      {(review ?? []).map((r: any) => <div key={r.id} style={{ borderTop: "1px solid #eee", padding: "8px 0", fontSize: 13 }}>
        <b>{r.score}</b> · {LABEL_TEXT[r.label as Label] ?? r.label} · {String(r.fields?.legal_name ?? r.fields?.buyer ?? r.fields?.permit_no ?? "")} · {r.fields?.city ?? r.fields?.county ?? ""}<br /><small>Why not published: {(r.gate_failures ?? []).join(", ") || `score below ${th}`}</small>
        <form action={reviewRecord} style={{ display: "inline", marginLeft: 8 }}><input type="hidden" name="id" value={r.id} /><input name="note" placeholder="reason" required minLength={3} /><button name="d" value="rejected">Reject</button><button name="d" value="archived">Archive</button></form></div>)}
      {!review?.length && <p>Nothing waiting.</p>}</section>
    <section><h2>Settings</h2><form action={saveSettings}>
      <label>Publish threshold <input name="threshold" type="number" defaultValue={th} min={50} max={100} /></label>{" "}
      <label>Founding seats per city+trade (N) <input name="slots" type="number" defaultValue={fo.slots ?? 10} /></label>{" "}
      <label>Founding % off <input name="pct" type="number" defaultValue={fo.percent_off ?? 25} /></label>{" "}
      <label>Stripe TEST coupon id <input name="coupon" defaultValue={fo.stripe_coupon ?? ""} placeholder="e.g. FOUNDING25" /></label>{" "}
      <label>Priority slots per city+trade <input name="priority" type="number" defaultValue={S.get("priority_slots")?.per_city_trade ?? 5} /></label>{" "}
      <button>Save</button></form><p><small>Founding offer is hidden until a coupon id is set. Counters are live from the database.</small></p></section>
    <p><small>Names: {byName.size} sources. Exports exclude non-redistributable sources and all personal data (intel_export view).</small></p>
  </main>;
}
