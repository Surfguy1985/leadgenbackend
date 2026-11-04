import { notFound, redirect } from "next/navigation";
import { adminDb, currentUser } from "@/lib/supabase";
import { siteDomain } from "@/lib/claims";
import ClaimFlow from "./ClaimFlow";
import { listingStats, PLAN_PERKS } from "@/lib/monetization";

export const dynamic = "force-dynamic";
/** Claim a directory business: sign in, then verify by business-domain email or by human review of proof. */
export default async function ClaimPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await currentUser();
  if (!s) redirect(`/login?next=${encodeURIComponent(`/claim/${id}`)}`);
  const { data: org } = await adminDb().from("organizations").select("id,business_name,city,primary_trade,kind,owner_user_id,is_directory_listed,public_website,website").eq("id", id).maybeSingle();
  if (!org || !org.is_directory_listed) notFound();
  const mine = org.owner_user_id === s.user.id;
  const st = await listingStats(adminDb(), { id: org.id, city: org.city, trade: org.primary_trade });
  return <main className="cfclaim"><style>{CSS}</style>
    <nav className="cfclaim__nav"><a className="cfclaim__brand" href="https://lead-gen-site-dc4966.webflow.io/">crew<span>for</span>that.</a><a className="cfclaim__back" href="https://lead-gen-site-dc4966.webflow.io/find-buyers">← Directory</a></nav>
    <div className="cfclaim__content">
      <header className="cfclaim__hero"><span>CLAIM YOUR BUSINESS · FREE</span><h1>{org.business_name}</h1>
        <p>{[org.city, org.kind?.replace(/_/g, " ")].filter(Boolean).join(" · ")}{org.public_website || org.website ? ` · ${siteDomain(org.public_website || org.website)}` : ""}</p></header>
      {mine ? <section className="cfclaim__card"><h2>This profile is yours.</h2><p><a href="/onboarding?claimed=1">Finish your profile →</a></p></section>
        : <ClaimFlow orgId={org.id} domain={siteDomain(org.public_website || org.website)} claimed={!!org.owner_user_id} signedInAs={s.user.email ?? ""} />}
      {!mine && (st.lines.length > 0 || st.competitor) && <section className="cfclaim__card"><span className="cfclaim__tag">REAL ACTIVITY · LAST 30 DAYS</span>
        <ul className="cfclaim__facts">{st.lines.map(l => <li key={l}>{l}</li>)}{st.competitor && <li>{st.competitor}</li>}</ul>
        {st.privateLeads30d > 0 && <div className="cfclaim__locked" aria-label="Locked private requests">{Array.from({ length: Math.min(3, st.privateLeads30d) }, (_, i) => <div key={i} className="cfclaim__blur"><b>Private request</b><i /><i /></div>)}<p>Request details unlock after you claim and choose a plan.</p></div>}</section>}
      {!mine && <section className="cfclaim__card"><span className="cfclaim__tag">FREE vs VERIFIED PRO</span>
        <div className="cfclaim__plans"><div><h3>Free claim</h3><ul>{PLAN_PERKS.free.map(p => <li key={p}>{p}</li>)}</ul></div>
        <div className="cfclaim__pro"><h3>Pro Match · 3-day free trial</h3><ul>{PLAN_PERKS.pro_match.map(p => <li key={p}>{p}</li>)}</ul>
          {org.city && org.primary_trade && <p>{st.priority.remaining} of {st.priority.cap} lead-priority slots left for {org.primary_trade.replace(/_/g, " ")} in {org.city}.</p>}
          {st.founding.open && st.founding.couponReady && <p><b>Founding member:</b> {st.founding.remaining} of {st.founding.cap} founding seats left here, {st.founding.percentOff}% off for as long as you stay subscribed.</p>}</div></div></section>}
      <p className="cfclaim__fine">We never verify ownership from a public phone number alone. Claims, codes and decisions are logged. Claiming is free; paid plans are optional.</p>
    </div></main>;
}
const CSS = `.cfclaim__facts{padding-left:18px;line-height:1.9;font-size:15px}.cfclaim__locked{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:12px}.cfclaim__blur{border:1px solid #EBE5F1;border-radius:16px;padding:16px;filter:blur(2.5px);user-select:none}.cfclaim__blur i{display:block;height:9px;background:#E4DEEE;border-radius:9px;margin-top:9px}.cfclaim__locked p{grid-column:1/-1;font-size:13px}.cfclaim__plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.cfclaim__plans>div{border:1px solid #EBE5F1;border-radius:18px;padding:18px}.cfclaim__pro{background:#29243F;color:#fff}.cfclaim__pro p,.cfclaim__pro li{color:#E8E3F5!important}
.cfclaim{min-height:100svh;background:#FAF9FC;color:#25223D;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;padding:25px 16px 75px}.cfclaim *{box-sizing:border-box}
.cfclaim__nav,.cfclaim__content{max-width:920px;margin:0 auto}.cfclaim__nav{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:28px}.cfclaim__brand{font-size:25px;font-weight:900;letter-spacing:-.085em;color:#27223C;text-decoration:none}.cfclaim__brand span{color:#7258D8}.cfclaim__back{font-size:12px;font-weight:800;color:#60586F;background:#fff;padding:12px 15px;border:1px solid #E9E5EF;border-radius:100px;text-decoration:none}
.cfclaim__hero{background:#E9E1FF;border-radius:28px;padding:clamp(30px,5vw,60px);margin-bottom:19px}.cfclaim__hero span,.cfclaim__tag{font-size:11px;letter-spacing:.13em;font-weight:850;color:#6E54BC}.cfclaim__hero h1{font-size:clamp(34px,5vw,58px);letter-spacing:-.06em;line-height:1.12;margin:17px 0 10px;overflow-wrap:anywhere}.cfclaim__hero p{font-size:15px;color:#706780;line-height:1.65;margin:0;text-transform:capitalize}
.cfclaim__card{border:1px solid #EBE5F1;background:#fff;padding:clamp(24px,4vw,40px);border-radius:26px;margin-bottom:14px}.cfclaim__card h2{font-size:clamp(24px,3vw,32px);letter-spacing:-.05em;margin:6px 0 12px}.cfclaim__card p{color:#736B7D;font-size:14px;line-height:1.7}
.cfclaim__tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}.cfclaim__tabs button{border:1px solid #E2DBED;background:#fff;border-radius:100px;padding:11px 16px;font-weight:800;font-size:12px;cursor:pointer;color:#4E4562}.cfclaim__tabs button[aria-pressed=true]{background:#29243F;color:#fff;border-color:#29243F}
.cfclaim__form{display:grid;gap:12px}.cfclaim__form label{font-size:11px;font-weight:850;letter-spacing:.06em;color:#4E4562}.cfclaim__form input:not([type=checkbox]),.cfclaim__form textarea{border:1px solid #E2DBED;border-radius:14px;padding:14px;font:inherit;background:#FCFAFE;width:100%;min-height:50px}
.cfclaim__form .cfclaim__consent{display:flex;gap:10px;font-weight:400;letter-spacing:0;font-size:13px;color:#665B77;line-height:1.5}.cfclaim__btn{border:0;border-radius:100px;background:#29243F;color:#fff;padding:15px 20px;font-weight:850;font-size:13px;cursor:pointer}.cfclaim__btn:disabled{opacity:.6;cursor:not-allowed}
.cfclaim__msg{padding:13px 15px;border-radius:13px;background:#F4F0FF;color:#4E3F8F!important}.cfclaim__err{background:#FFF1EE;color:#8F3F2B!important}.cfclaim__fine{font-size:12px;color:#91889A;line-height:1.6;margin-top:18px}
.cfclaim__upsell{border-radius:22px;background:#F0F9EB;border:1px solid #DBEDD0;padding:22px;margin-top:8px}.cfclaim__upsell a{font-weight:800;color:#2E5634}`;
