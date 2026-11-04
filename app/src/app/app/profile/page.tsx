import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function nice(value:string|null|undefined){return value?value.replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase()):"Not provided";}
export default async function ContractorProfile(){
  const session=await currentUser();if(!session)redirect("/login?next=/app/profile");
  const {data:org}=await session.db.from("organizations").select("id,business_name,website,verified_status,claim_status,city,zip,public_profile_optin")
    .eq("owner_user_id",session.user.id).eq("kind","contractor").maybeSingle();
  if(!org)redirect("/onboarding");
  const {data:profile}=await session.db.from("contractor_profiles").select("trades,zip_codes,statewide,license_status,insurance_status,availability_confirmed_at,accepts_leads")
    .eq("organization_id",org.id).maybeSingle();
  const tradeCount=profile?.trades?.length??0;
  const geoCount=profile?.zip_codes?.length??0;
  const checks=[
    {name:"Company identity",done:!!org.business_name,details:org.business_name||"Add your business name"},
    {name:"Services defined",done:tradeCount>0,details:tradeCount+ " service categories selected"},
    {name:"Coverage recorded",done:geoCount>0||!!profile?.statewide,details:profile?.statewide?"Statewide public-bid discovery":geoCount+" service ZIP codes"},
    {name:"Business independently verified",done:org.verified_status==="verified",details:org.verified_status==="verified"?"Verified by the platform":"Independent verification not completed"},
    {name:"License verification",done:profile?.license_status==="verified",details:profile?.license_status==="verified"?"Verified documentation":"Not verified; trade-specific requirements may apply"},
    {name:"Insurance verification",done:profile?.insurance_status==="verified",details:profile?.insurance_status==="verified"?"Verified documentation":"Not verified by Crewforthat"},
  ];
  const completed=checks.filter(c=>c.done).length;
  return <main className="cfready"><style>{`
    .cfready{background:#F9F8FC;color:#29243D;min-height:100svh;padding:23px clamp(17px,4vw,60px) 85px;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif}
    .cfready *{box-sizing:border-box}.cfready__nav,.cfready__wrap{max-width:1170px;margin:auto}
    .cfready__nav{display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap;margin-bottom:29px}
    .cfready__brand{text-decoration:none;color:#29243D;letter-spacing:-.08em;font-size:25px;font-weight:900}.cfready__brand span{color:#7357DA}
    .cfready__back{background:#fff;border-radius:100px;border:1px solid #EAE5F0;padding:12px 17px;color:#5C566D;font-size:12px;font-weight:800;text-decoration:none}
    .cfready__hero{background:#EAE2FF;border-radius:31px;padding:clamp(30px,5vw,58px);display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}
    .cfready__kicker{font-size:11px;font-weight:850;letter-spacing:.13em;color:#7156CE}.cfready__hero h1{font-size:clamp(36px,5vw,63px);line-height:1.11;letter-spacing:-.071em;margin:17px 0}
    .cfready__hero p{max-width:680px;font-size:14px;color:#716881;line-height:1.7;margin:0}.cfready__score{border-radius:24px;background:#fff;padding:23px;min-width:178px;text-align:center}
    .cfready__score strong{font-size:44px;font-weight:900;letter-spacing:-.06em;display:block}.cfready__score small{color:#857992;font-size:11px;font-weight:750}
    .cfready__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.47fr);gap:17px;margin-top:19px}
    .cfready__card{border-radius:24px;background:#fff;border:1px solid #E8E4EE;padding:clamp(23px,3vw,35px)}.cfready__card h2{font-size:25px;letter-spacing:-.053em;margin:0 0 10px}
    .cfready__card>p{font-size:13px;color:#82798C;line-height:1.7}
    .cfready__list{display:grid;gap:10px;margin-top:24px}.cfready__item{display:flex;gap:12px;align-items:flex-start;padding:17px;border-radius:16px;background:#FAF9FC;border:1px solid #F0EDF4}
    .cfready__symbol{flex:0 0 32px;height:32px;border-radius:100%;background:#F6ECDD;display:grid;place-items:center;color:#876B3B;font-weight:900}
    .cfready__item[data-done="true"] .cfready__symbol{background:#E6F7E8;color:#3E824E}.cfready__item strong{display:block;color:#302B41;font-size:14px}
    .cfready__item p{font-size:12px;line-height:1.55;color:#81798D;margin:6px 0 0}
    .cfready__tag{display:inline-block;border-radius:100px;padding:10px 13px;background:#F0EBFF;color:#7053CB;font-size:11px;font-weight:850;margin:7px 7px 0 0}
    .cfready__link{display:inline-flex;justify-content:center;align-items:center;border-radius:100px;padding:14px 21px;background:#29243F;color:#fff;text-decoration:none;font-size:12px;font-weight:850;margin-top:19px}
    .cfready__warning{margin-top:17px;border-radius:18px;background:#FFF4E6;padding:19px;color:#765C3B;font-size:12px;line-height:1.7}
    .cfready__foot{margin:22px 0;color:#8C8295;line-height:1.65;font-size:12px}
    @media(max-width:840px){.cfready__grid{grid-template-columns:1fr}}@media(max-width:500px){.cfready__score{width:100%}.cfready__hero{border-radius:24px;padding:30px 23px}.cfready__card{padding:23px}}
  `}</style>
  <nav className="cfready__nav"><Link href="/app" className="cfready__brand">crew<span>for</span>that.</Link><Link href="/dashboard" className="cfready__back">← Dashboard</Link></nav>
  <div className="cfready__wrap"><header className="cfready__hero">
    <div><span className="cfready__kicker">YOUR COMPANY / TRUST & READINESS</span><h1>Build trust that holds up.</h1><p>Only completed, verified records count toward your readiness checklist. This is an account-setup indicator, not a contractor quality rating or certification.</p></div>
    <div className="cfready__score"><strong>{completed}/{checks.length}</strong><small>ACCOUNT CHECKS COMPLETE</small></div>
  </header><div className="cfready__grid"><section className="cfready__card"><h2>Company readiness</h2><p>See what a potential project match would need before your company could be considered qualified.</p>
    <div className="cfready__list">{checks.map(x=><div className="cfready__item" data-done={x.done} key={x.name}><span className="cfready__symbol" aria-label={x.done?"Complete":"Not verified"}>{x.done?"✓":"·"}</span><div><strong>{x.name}</strong><p>{x.details}</p></div></div>)}</div>
  </section><aside><section className="cfready__card"><h2>{org.business_name}</h2><p>Recorded company information</p>
    {(profile?.trades||[]).map((t:string)=><span className="cfready__tag" key={t}>{nice(t)}</span>)}
    {geoCount>0&&<p>{geoCount} service ZIP code{geoCount===1?"":"s"} configured</p>}
    <p>Public directory listing: {org.public_profile_optin?"Opted in (subject to publication review)":"Not opted in"}</p>
    <Link className="cfready__link" href="/onboarding">Edit company basics ↗</Link>
  </section><div className="cfready__warning">Verification statuses are factual account records. We do not award verified badges automatically or promise matching until operational, consent and qualification checks pass.</div></aside></div>
  <p className="cfready__foot">Information is private to your contractor account unless separately opted in and approved for publication. For documentation verification, use the support workflow.</p></div></main>;
}