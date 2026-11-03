import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Contractor dashboard. Uses the user-scoped client, so RLS decides what is visible. */
export default async function Dashboard() {
  const u = await currentUser();
  if (!u) redirect("/login");
  const { db } = u;
  const [{ data: matches }, { data: access }, { data: subs }, { data: notifs }] = await Promise.all([
    db.from("matches").select("id,match_score,match_factors,notification_status,opportunity_id,created_at").order("created_at", { ascending: false }).limit(50),
    db.from("lead_access").select("id,opportunity_id,status,granted_at").eq("status", "active"),
    db.from("subscriptions").select("plan,status,current_period_end"),
    db.from("notifications").select("id,status").eq("status", "sent"),
  ]);
  const oppIds = [...new Set((matches ?? []).map(m => m.opportunity_id))];
  const { data: opps } = oppIds.length ? await db.from("opportunities").select("id,kind,title,trade,city,zip,deadline,status").in("id", oppIds) : { data: [] };
  const byId = new Map((opps ?? []).map(o => [o.id, o]));
  const label = (k?: string) => k === "public_bid" ? "Public bid (not exclusive)" : k === "private_lead" ? "Verified private lead" : "Discovery signal (unverified)";

  return (
    <main>
      <h1>Your dashboard</h1>
      <section><h2>Subscription</h2>
        {subs?.length ? subs.map((s, i) => <p key={i}>{s.plan} — {s.status}{s.current_period_end ? ` (renews ${new Date(s.current_period_end).toLocaleDateString("en-US")})` : ""}</p>) : <p>Free plan</p>}
        <p><small>Test pricing. Matches are a heuristic; no project, award, or lead volume is guaranteed.</small></p>
      </section>
      <section><h2>Matched opportunities {notifs?.length ? `(${notifs.length} alerts)` : ""}</h2>
        <table cellPadding={6}><thead><tr><th>Type</th><th>Title</th><th>Trade</th><th>Location</th><th>Deadline</th><th>Score</th></tr></thead>
          <tbody>{(matches ?? []).map(m => { const o = byId.get(m.opportunity_id); return (
            <tr key={m.id}><td>{label(o?.kind)}</td><td>{o?.title ?? "Restricted"}</td><td>{o?.trade}</td><td>{o ? `${o.city ?? ""} ${o.zip ?? ""}` : ""}</td><td>{o?.deadline ? new Date(o.deadline).toLocaleDateString("en-US") : "—"}</td><td>{m.match_score}</td></tr>); })}
          </tbody></table>
      </section>
      <section><h2>Leads you can contact</h2><p>{access?.length ?? 0} active</p></section>
    </main>
  );
}
