import { notFound } from "next/navigation";
import { adminDb, requireRole, type AdminRole } from "@/lib/supabase";

export const dynamic="force-dynamic";
type Stat={label:string;value:number|null;note:string;target?:string};
const count = async (table:string,filters?:(q:any)=>any) => {
 const base=adminDb().from(table).select("id",{count:"exact",head:true});
 const q=filters?filters(base):base;
 const {count,error}=await q;
 return error?null:(count??0);
};
function fmt(n:number|null) {return n===null?"—":n.toLocaleString("en-US");}
function Card({stat}:{stat:Stat}) {
 return <article className="cfadmin__card"><span>{stat.label}</span><strong>{fmt(stat.value)}</strong><p>{stat.note}</p>{stat.target&&<a href={stat.target}>Open workspace ↗</a>}</article>;
}
export default async function AdminOverview(){
 const me=await requireRole(["owner","finance_admin","content_admin","support_agent","auditor_readonly"]);
 if(!me)notFound();
 const roles=me.roles;
 const money=roles.has("owner")||roles.has("finance_admin")||roles.has("auditor_readonly");
 const [jobs,privateLeads,contractors,buyers,queue,failures,privacy,claims,subs,incidents]=await Promise.all([
  count("opportunities",q=>q.eq("kind","public_bid").eq("status","published").eq("visibility","public").eq("is_test_data",false)),
  count("opportunities",q=>q.eq("kind","private_lead").eq("verification_status","verified").eq("status","published")),
  count("organizations",q=>q.eq("kind","contractor")),
  count("organizations",q=>q.eq("is_directory_listed",true)),
  count("moderation_queue",q=>q.eq("review_state","open")),
  count("workflow_failures",q=>q.neq("state","resolved")),
  count("privacy_requests",q=>q.in("status",["open","verifying","in_progress"])),
  count("profile_claims",q=>q.eq("status","pending")),
  money?count("subscriptions",q=>q.in("status",["active","trialing"])):Promise.resolve(null),
  count("moderation_queue",q=>q.in("case_type",["abuse","rights","report_listing"]).eq("review_state","open")),
 ]);
 const asOf=new Date().toLocaleString("en-US",{timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short"});
 const cards:Stat[]=[
  {label:"APPROVED PUBLIC BIDS",value:jobs,note:"Open, non-test listings. No bids are exclusive.",target:"/admin"},
  {label:"VERIFIED PRIVATE REQUESTS",value:privateLeads,note:"Private, consent-gated requests only.",target:"/admin"},
  {label:"CONTRACTOR COMPANIES",value:contractors,note:"Recorded company accounts; not assumed vetted."},
  {label:"PUBLISHED BUYER PROFILES",value:buyers,note:"Directory data, not an open-job guarantee."},
  {label:"OPEN MODERATION",value:queue,note:"Content, provenance, duplicates and quality decisions.",target:"/admin"},
  {label:"WORKFLOW FAILURES",value:failures,note:"Exceptions requiring review or retry.",target:"/admin"},
  {label:"PRIVACY REQUESTS",value:privacy,note:"Human-reviewed export, correction and deletion queue.",target:"/admin"},
  {label:"BUSINESS CLAIMS",value:claims,note:"Pending identity/ownership review. Never auto-approved.",target:"/admin"},
  {label:"SAFETY & QUALITY REPORTS",value:incidents,note:"Broken links, rights issues and complaints.",target:"/admin"},
  ...(money?[{label:"ACTIVE/TRIAL SUBSCRIPTIONS",value:subs,note:"Account status count—not revenue, settled cash, or verified MRR.",target:"/admin"}]:[]),
 ];
 return <main className="cfadmin"><style>{`
  .cfadmin{min-height:100svh;background:#F9F8FC;color:#29243D;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;padding:25px clamp(15px,5vw,80px) 95px}.cfadmin *{box-sizing:border-box}
  .cfadmin__nav,.cfadmin__main{max-width:1260px;margin:auto}.cfadmin__nav{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:27px}
  .cfadmin__logo{font-size:25px;letter-spacing:-.075em;font-weight:900;text-decoration:none;color:#29243D}.cfadmin__logo span{color:#7558DE}
  .cfadmin__navlinks{display:flex;gap:8px;flex-wrap:wrap}.cfadmin__navlinks a{border:1px solid #EAE5F0;background:#fff;border-radius:100px;padding:10px 14px;font-size:12px;font-weight:800;text-decoration:none;color:#5F586B}
  .cfadmin__hero{border-radius:32px;background:#EAE2FF;padding:clamp(32px,5vw,58px);display:flex;align-items:flex-end;justify-content:space-between;gap:25px;flex-wrap:wrap}
  .cfadmin__eyebrow{color:#7156CA;font-size:11px;font-weight:850;letter-spacing:.13em}
  .cfadmin__hero h1{font-size:clamp(39px,5vw,66px);line-height:1.1;letter-spacing:-.07em;margin:17px 0 12px}
  .cfadmin__hero p{font-size:14px;color:#726A7E;line-height:1.65;max-width:750px;margin:0}
  .cfadmin__asof{border-radius:100px;background:#fff;padding:13px 19px;font-size:12px;font-weight:800;color:#685E79}
  .cfadmin__section{margin:35px 0}.cfadmin__section h2{font-size:27px;font-weight:850;letter-spacing:-.054em;margin:0 0 18px}
  .cfadmin__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}
  .cfadmin__card{min-height:195px;border-radius:25px;border:1px solid #EAE6F0;background:#fff;padding:28px;display:flex;flex-direction:column;gap:12px}
  .cfadmin__card>span{color:#81798B;font-size:10px;font-weight:850;letter-spacing:.1em}.cfadmin__card strong{font-size:43px;letter-spacing:-.08em;line-height:1;font-weight:900}
  .cfadmin__card p{font-size:12px;line-height:1.55;color:#847B8B;margin:0}.cfadmin__card a{color:#6951CF;text-decoration:none;font-weight:850;font-size:11px;margin-top:auto}
  .cfadmin__warning{background:#FFF5E7;border:1px solid #F4E0BF;padding:24px;border-radius:22px;color:#775E36;font-size:13px;line-height:1.7}
  .cfadmin__foot{font-size:12px;color:#918995;line-height:1.65;margin-top:23px}
  @media(max-width:980px){.cfadmin__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:620px){.cfadmin__grid{grid-template-columns:1fr}.cfadmin__card{min-height:0}.cfadmin__hero{padding:30px 25px;border-radius:25px}}
 `}</style>
 <nav className="cfadmin__nav"><a className="cfadmin__logo" href="https://lead-gen-site-dc4966.webflow.io/">crew<span>for</span>that. <span style={{color:"#8C8799",fontSize:13,letterSpacing:0}}>ADMIN</span></a><div className="cfadmin__navlinks"><a href="/admin">Operations</a><a href="/dashboard">Contractor view</a></div></nav>
 <div className="cfadmin__main"><header className="cfadmin__hero"><div><span className="cfadmin__eyebrow">CREWFORTHAT / OWNER CONTROL CENTER</span><h1>Know what matters.</h1><p>Real database counts—not generated forecasts. Access is restricted by your administrator role. Every sensitive action belongs in an auditable, permissioned workflow.</p></div><span className="cfadmin__asof">As of {asOf} CT</span></header>
 <section className="cfadmin__section" aria-label="Business and safety metrics"><h2>Platform snapshot</h2><div className="cfadmin__grid">{cards.map(x=><Card key={x.label} stat={x}/>)}</div></section>
 <aside className="cfadmin__warning"><strong>Release controls:</strong> Paid plan checkout is hidden until signed Stripe and cancellation acceptance tests pass. Customer project submissions remain gated until verified email delivery and a supervised pilot match succeed. Unknown values are never converted to fabricated revenue or success figures.</aside>
 <p className="cfadmin__foot">This dashboard does not replace Stripe reconciliation, protected moderation details, or a financial statement. Open Operations for permitted review actions. Roles: {[...roles].join(", ")}.</p>
 </div></main>;
}
