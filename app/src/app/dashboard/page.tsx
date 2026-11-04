import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** User-scoped queries: Supabase RLS remains the authorization boundary. */
export default async function Dashboard() {
  const session = await currentUser();
  if (!session) redirect("/login");
  const { db, user } = session;
  const [{ data: matches }, { data: accesses }, { data: subs }, { data: alerts }, { data: orgs }] = await Promise.all([
    db.from("matches").select("id,match_score,match_factors,notification_status,opportunity_id,created_at").order("created_at", { ascending: false }).limit(50),
    db.from("lead_access").select("id,opportunity_id,status,granted_at").eq("status", "active"),
    db.from("subscriptions").select("plan,status,current_period_end"),
    db.from("notifications").select("id,status").eq("status", "sent"),
    db.from("organizations").select("id,business_name").eq("owner_user_id", user.id).eq("kind", "contractor").limit(1),
  ]);
  if (!orgs?.length) redirect("/onboarding");
  const ids = [...new Set((matches ?? []).map(m => m.opportunity_id))];
  const { data: opps } = ids.length
    ? await db.from("opportunities").select("id,kind,title,trade,city,zip,deadline,status").in("id", ids)
    : { data: [] };
  const byId = new Map((opps ?? []).map(o => [o.id, o]));
  const typeLabel = (kind?: string) =>
    kind === "public_bid" ? "PUBLIC BID" : kind === "private_lead" ? "VERIFIED PRIVATE REQUEST" : "DISCOVERY SIGNAL";
  const plan = subs?.find(x => ["active", "trialing"].includes(x.status))?.plan ?? "Free";

  return (
    <main className="cf-dash">
      <style>{`
      .cf-dash{background:#F9F8FC;min-height:100svh;color:#28243D;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif}
      .cf-dash *{box-sizing:border-box}.cf-dash a{color:inherit}
      .cf-dash__nav{max-width:1270px;padding:22px 24px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:16px}
      .cf-dash__brand{font-size:26px;font-weight:900;letter-spacing:-.08em;text-decoration:none!important}.cf-dash__brand span{color:#7658DC}
      .cf-dash__nav-links{display:flex;flex-wrap:wrap;align-items:center;gap:13px}.cf-dash__nav-links a{text-decoration:none;padding:11px 16px;border-radius:100px;border:1px solid #E7E2EC;font-size:12px;font-weight:800;background:#fff}
      .cf-dash__main{max-width:1270px;margin:0 auto;padding:15px 24px 90px}
      .cf-dash__hero{border-radius:32px;padding:clamp(28px,4vw,51px);background:#EAE2FF;display:flex;align-items:end;justify-content:space-between;gap:27px;flex-wrap:wrap}
      .cf-dash__eyebrow{font-size:11px;letter-spacing:.13em;font-weight:850;color:#7054C4;margin:0 0 14px}
      .cf-dash__hero h1{font-size:clamp(36px,5vw,62px);letter-spacing:-.072em;line-height:1.1;margin:0 0 13px}
      .cf-dash__hero p{font-size:14px;line-height:1.7;color:#736984;margin:0;max-width:630px}
      .cf-dash__badge{border-radius:100px;font-size:11px;font-weight:800;color:#5B4B99;background:#fff;padding:12px 17px}
      .cf-dash__stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;margin:19px 0 37px}
      .cf-dash__stat{border-radius:23px;background:#fff;border:1px solid #EBE7F0;padding:23px 26px}
      .cf-dash__stat label{display:block;font-size:11px;font-weight:800;color:#8A8395;letter-spacing:.07em;margin-bottom:11px}
      .cf-dash__stat strong{font-size:37px;font-weight:850;letter-spacing:-.07em;display:block}
      .cf-dash__section-title{display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap;margin:0 0 18px}
      .cf-dash__section-title h2{font-size:29px;line-height:1.2;letter-spacing:-.055em;margin:0}
      .cf-dash__section-title a{font-size:12px;font-weight:800;background:#28243F;color:#fff;border-radius:100px;padding:14px 20px;text-decoration:none}
      .cf-dash__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .cf-dash__card{padding:25px;border-radius:25px;border:1px solid #EAE6F1;background:#fff;min-width:0;display:flex;flex-direction:column}
      .cf-dash__card-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .cf-dash__chip{font-size:10px;color:#6E52C5;background:#EFEAFE;padding:9px 12px;border-radius:100px;font-weight:800;letter-spacing:.06em}
      .cf-dash__score{color:#7F768D;font-size:12px;font-weight:700}
      .cf-dash__card h3{font-size:23px;line-height:1.25;letter-spacing:-.04em;overflow-wrap:anywhere;margin:21px 0 12px}
      .cf-dash__meta{display:flex;gap:9px;flex-wrap:wrap;color:#746D80;font-size:12px;margin:0 0 20px;line-height:1.5}
      .cf-dash__card footer{border-top:1px solid #F0EDF4;margin-top:auto;padding-top:18px;font-size:12px;color:#8A8291;line-height:1.6}
      .cf-dash__empty{border:1px dashed #DCD2EF;background:#F4F0FF;border-radius:28px;padding:clamp(30px,5vw,55px)}
      .cf-dash__empty h3{font-size:26px;letter-spacing:-.05em;margin:0 0 10px}
      .cf-dash__empty p{color:#716983;font-size:14px;max-width:650px;line-height:1.7;margin:0 0 20px}
      .cf-dash__empty a{font-size:13px;font-weight:800;background:#28243F;color:#fff;border-radius:100px;padding:14px 20px;text-decoration:none;display:inline-flex}
      .cf-dash__note{margin:30px 0 0;color:#91889A;font-size:12px;line-height:1.7}
      @media(max-width:780px){.cf-dash__stats{grid-template-columns:1fr 1fr}.cf-dash__grid{grid-template-columns:1fr}.cf-dash__hero{border-radius:25px}}
      @media(max-width:460px){.cf-dash__nav{padding:17px}.cf-dash__nav-links{gap:6px}.cf-dash__nav-links a{font-size:11px;padding:10px 11px}.cf-dash__main{padding:13px 13px 60px}.cf-dash__stats{grid-template-columns:1fr;gap:9px;margin:13px 0 28px}.cf-dash__stat{padding:17px 20px}.cf-dash__stat strong{font-size:31px}.cf-dash__card{padding:22px}.cf-dash__hero h1{font-size:40px}}
      `}</style>
      <header className="cf-dash__nav">
        <a className="cf-dash__brand" href="https://lead-gen-site-dc4966.webflow.io/">crew<span>for</span>that.</a>
        <nav className="cf-dash__nav-links" aria-label="Contractor navigation">
          <a href="https://lead-gen-site-dc4966.webflow.io/opportunities">Browse public bids</a>
          <a href="/onboarding">Profile</a>
        </nav>
      </header>
      <div className="cf-dash__main">
        <section className="cf-dash__hero">
          <div><p className="cf-dash__eyebrow">YOUR CONTRACTOR WORKSPACE</p>
            <h1>Welcome to your crew.</h1>
            <p>{orgs[0].business_name} · Your public bidding workspace. Private DFW project matching is not yet available.</p>
          </div>
          <span className="cf-dash__badge">{plan} access</span>
        </section>
        <div className="cf-dash__stats">
          <div className="cf-dash__stat"><label>MATCHED OPPORTUNITIES</label><strong>{matches?.length ?? 0}</strong></div>
          <div className="cf-dash__stat"><label>DELIVERED ALERTS</label><strong>{alerts?.length ?? 0}</strong></div>
          <div className="cf-dash__stat"><label>ACTIVE CONTACT PERMISSIONS</label><strong>{accesses?.length ?? 0}</strong></div>
        </div>
        <section aria-labelledby="cf-matches-heading">
          <div className="cf-dash__section-title"><h2 id="cf-matches-heading">Your opportunities</h2><a href="https://lead-gen-site-dc4966.webflow.io/opportunities">Browse public bids ↗</a></div>
          {matches?.length ?
            <div className="cf-dash__grid">{matches.map(m=>{
              const opportunity=byId.get(m.opportunity_id);
              return <article className="cf-dash__card" key={m.id}>
                <div className="cf-dash__card-top"><span className="cf-dash__chip">{typeLabel(opportunity?.kind)}</span><span className="cf-dash__score">Fit score: {m.match_score}</span></div>
                <h3>{opportunity?.title ?? "Restricted opportunity"}</h3>
                <div className="cf-dash__meta"><span>{opportunity?.trade ?? "Trade under review"}</span><span>·</span><span>{[opportunity?.city,opportunity?.zip].filter(Boolean).join(" ")||"Location not available"}</span></div>
                <footer>{opportunity?.deadline ? `Apply by ${new Date(opportunity.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`:"Review the issuing source for the official deadline."} · Matches do not guarantee work.</footer>
              </article>;
            })}</div> :
            <div className="cf-dash__empty"><h3>Let's find your next opportunity.</h3><p>You don't have any private matches yet. Start by exploring verified public bids—no payment required. New direct customer matching will launch after verification and notification systems pass testing.</p><a href="https://lead-gen-site-dc4966.webflow.io/opportunities">Explore available public work ↗</a></div>}
        </section>
        <p className="cf-dash__note">Public bids are nonexclusive and subject to the issuing organization's rules and deadlines. Contractor contact access is restricted and permission-based.</p>
      </div>
    </main>
  );
}
