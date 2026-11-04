"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
type Listing={id:string;title:string;summary:string|null;trade:string;subtrades:string[]|null;property_type:string|null;city:string|null;state:string|null;zip:string|null;budget_min:number|null;budget_max:number|null;deadline:string|null;source_url:string|null;official_apply_url:string|null;last_checked_at:string|null;last_verified_at:string|null;published_at:string|null;listing_type:string|null;geographic_scope:string|null};
const tasks=[
 ["Confirm eligibility","Read the issuer's registration, licensing, insurance, certifications and set-aside requirements."],
 ["Review scope","Read the full notice, all attachments, amendments and any mandatory site-visit details."],
 ["Verify deadlines","Check the issuing organization's most recent notice. Its dates override this summary."],
 ["Prepare a response","Collect qualifications, references and pricing, then use the issuer's approved submission process."],
];
function date(v:string|null,withTime=false){if(!v)return "Not provided";const d=new Date(v);return Number.isNaN(d.getTime())?"Not provided":d.toLocaleString("en-US",withTime?{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}:{month:"short",day:"numeric",year:"numeric"});}
function safe(v:string|null){if(!v)return null;try{const u=new URL(v);return u.protocol==="https:"||u.protocol==="http:"?u.href:null}catch{return null}}
export default function OpportunityDetail({params}:{params:Promise<{id:string}>}){
 const {id}=use(params);
 const [item,setItem]=useState<Listing|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [saved,setSaved]=useState<string|null>(null),[saving,setSaving]=useState(false),[done,setDone]=useState<number[]>([]),[copied,setCopied]=useState(false);
 useEffect(()=>{let live=true;setLoading(true);
  Promise.all([
   fetch("/api/public/opportunities/"+encodeURIComponent(id),{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error(r.status===404?"This notice is no longer publicly available.":"Could not retrieve this public notice.");return r.json()}),
   fetch("/api/contractor/saved",{cache:"no-store"}).then(async r=>r.ok?r.json():{items:[]}).catch(()=>({items:[]}))
  ]).then(([data,bookmarks])=>{if(!live)return;setItem(data.opportunity);setSaved((bookmarks.items||[]).find((x:{opportunity_id:string})=>x.opportunity_id===id)?.id||null)})
  .catch(e=>{if(live)setError(e instanceof Error?e.message:"Unable to load listing.")})
  .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[id]);
 const source=useMemo(()=>safe(item?.official_apply_url||null)||safe(item?.source_url||null),[item]);
 const checked=item?.last_checked_at||item?.last_verified_at||null;
 const checkedDays=checked?Math.floor((Date.now()-new Date(checked).getTime())/86400000):null;
 const expires=item?.deadline?new Date(item.deadline):null;
 const days=expires&&!Number.isNaN(expires.getTime())?Math.ceil((expires.getTime()-Date.now())/86400000):null;
 const deadlineStatus=days===null?"Check official notice":days<0?"Listed deadline passed":days===0?"Listed deadline is today":days===1?"1 day until listed deadline":days+" days until listed deadline";
 const money=item&&(item.budget_min!==null||item.budget_max!==null);
 async function saveItem(){if(saving||!item)return;setSaving(true);setError("");try{
  const r=await fetch(saved?"/api/contractor/saved?id="+encodeURIComponent(saved):"/api/contractor/saved",saved?{method:"DELETE"}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunity_id:item.id})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||"Could not update saved work.");
  setSaved(saved?null:j.id);
 }catch(e){setError(e instanceof Error?e.message:"Save unavailable.")}finally{setSaving(false)}}
 async function share(){try{await navigator.clipboard.writeText(window.location.href);setCopied(true)}catch{setError("Copy unavailable. Copy the address from your browser.")}}
 return <main className="cdetail"><style>{`
 .cdetail{min-height:100svh;background:#FAF9FC;color:#28243D;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif}
 .cdetail *{box-sizing:border-box}.cdetail__nav,.cdetail__wrap{max-width:1220px;margin:auto;padding-left:clamp(17px,4vw,55px);padding-right:clamp(17px,4vw,55px)}
 .cdetail__nav{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:22px;padding-bottom:25px}
 .cdetail__logo{font-weight:900;font-size:25px;letter-spacing:-.08em;text-decoration:none;color:#242038}.cdetail__logo span{color:#745AD7}
 .cdetail__back{padding:12px 18px;border:1px solid #E9E4EF;background:#fff;border-radius:100px;font-size:12px;font-weight:800;text-decoration:none;color:#5B5470}
 .cdetail__hero{background:#EAE2FF;border-radius:32px;padding:clamp(28px,5vw,57px);margin:0 0 19px}
 .cdetail__eyebrow{font-size:10px;letter-spacing:.13em;font-weight:850;color:#7357C6}.cdetail__hero h1{font-size:clamp(34px,5.1vw,63px);line-height:1.14;letter-spacing:-.067em;margin:17px 0;overflow-wrap:anywhere}
 .cdetail__hero p{color:#6D647D;line-height:1.7;font-size:15px;max-width:860px}
 .cdetail__badges{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.cdetail__badge{background:#fff;border:1px solid #E8E0F7;color:#6D55A5;padding:10px 14px;border-radius:100px;font-size:11px;font-weight:800}
 .cdetail__badge--green{background:#E4F5D9;border-color:#D7ECCC;color:#426F40}
 .cdetail__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.43fr);align-items:start;gap:17px}
 .cdetail__section,.cdetail__aside{background:#fff;border-radius:25px;border:1px solid #EAE5F0;padding:clamp(23px,3vw,33px);margin-bottom:17px}
 .cdetail__section h2{font-size:26px;letter-spacing:-.05em;margin:0 0 15px}.cdetail__section p{color:#776F83;font-size:14px;line-height:1.78;margin:0 0 17px}
 .cdetail__facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cdetail__fact{background:#F7F5FB;border:1px solid #F0EDF5;border-radius:16px;padding:17px}
 .cdetail__fact small{display:block;font-size:10px;font-weight:850;color:#827A90;letter-spacing:.085em;margin-bottom:9px}.cdetail__fact strong{font-size:15px;color:#302940;line-height:1.4;overflow-wrap:anywhere}
 .cdetail__checklist{display:grid;gap:9px}.cdetail__check{display:flex;gap:12px;align-items:flex-start;background:#FAF9FC;border:1px solid #F0ECF4;border-radius:16px;padding:17px;cursor:pointer}
 .cdetail__check input{accent-color:#775ADB;width:18px;height:18px;flex:0 0 auto;margin-top:2px}.cdetail__check strong{display:block;font-size:14px;color:#302940}.cdetail__check span span{display:block;margin-top:6px;color:#7E7789;line-height:1.6;font-size:12px}
 .cdetail__aside{position:sticky;top:18px;display:grid;gap:13px}.cdetail__aside h2{font-size:22px;letter-spacing:-.05em;margin:0}.cdetail__aside p{font-size:13px;line-height:1.7;color:#797185;margin:0}
 .cdetail__action{display:block;text-align:center;border-radius:100px;padding:15px 19px;background:#2B253F;color:#fff!important;text-decoration:none;font-size:13px;font-weight:850;border:0;cursor:pointer}
 .cdetail__action[aria-disabled="true"]{pointer-events:none;background:#D8D4DF;color:#5E5A69!important}
 .cdetail__secondary{border:1px solid #E5DFF0;border-radius:100px;padding:13px 18px;background:#F8F6FC;color:#5F5377;font-size:12px;font-weight:850;cursor:pointer}
 .cdetail__source{overflow-wrap:anywhere;padding:15px;background:#F7F5FC;border-radius:14px;color:#777184;font-size:12px}
 .cdetail__source a{color:#6651C6}.cdetail__warning{font-size:12px;line-height:1.65;background:#FFF3E4;color:#825A31;border-radius:14px;padding:15px}
 .cdetail__error{color:#963C35;background:#FFF0ED;padding:15px;border-radius:15px;font-size:13px;margin:10px 0}
 .cdetail__foot{font-size:12px;line-height:1.65;color:#948C9D;margin:24px 0 45px}
 @media(max-width:850px){.cdetail__grid{grid-template-columns:1fr}.cdetail__aside{position:static;grid-row:1}.cdetail__hero{border-radius:25px}}
 @media(max-width:550px){.cdetail__facts{grid-template-columns:1fr}.cdetail__nav{padding-top:17px}.cdetail__hero{padding:29px 22px}.cdetail__section,.cdetail__aside{padding:23px}.cdetail__hero h1{font-size:36px}}
 @media(prefers-reduced-motion:reduce){.cdetail *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
 `}</style>
 <nav className="cdetail__nav"><Link href="/app" className="cdetail__logo">crew<span>for</span>that.</Link><Link href="/app" className="cdetail__back">← Back to opportunities</Link></nav>
 <div className="cdetail__wrap">{loading?<section className="cdetail__section" role="status">Loading opportunity details…</section>:!item?<section className="cdetail__section" role="alert"><h1>Listing unavailable.</h1><p>{error||"This notice is not available."}</p><Link href="/app">Return to the job board →</Link></section>:<>
 <header className="cdetail__hero"><span className="cdetail__eyebrow">OFFICIAL PUBLIC OPPORTUNITY · SOURCE-FIRST</span>
 <h1>{item.title}</h1><div className="cdetail__badges"><span className="cdetail__badge">{item.trade.replaceAll("_"," ")}</span><span className="cdetail__badge">{[item.city,item.state].filter(Boolean).join(", ")||"Location not provided"}</span><span className="cdetail__badge cdetail__badge--green">Public notice</span></div>
 <p>{item.summary||"Review the original notice for its scope, qualification requirements and application procedure."}</p></header>
 <div className="cdetail__grid"><div>
 <section className="cdetail__section"><h2>Opportunity snapshot</h2>
 <div className="cdetail__facts"><div className="cdetail__fact"><small>LISTED DEADLINE</small><strong>{date(item.deadline)}</strong></div><div className="cdetail__fact"><small>LOCATION</small><strong>{[item.city,item.state,item.zip].filter(Boolean).join(" · ")||"See issuer"}</strong></div>
 <div className="cdetail__fact"><small>TRADE</small><strong>{item.trade.replaceAll("_"," ")}</strong></div><div className="cdetail__fact"><small>PROPERTY TYPE</small><strong>{item.property_type||"Confirm at source"}</strong></div>
 <div className="cdetail__fact"><small>LAST SOURCE CHECK</small><strong>{date(checked)}</strong></div><div className="cdetail__fact"><small>PUBLISHED</small><strong>{date(item.published_at)}</strong></div>
 {money&&<div className="cdetail__fact"><small>LISTED BUDGET RANGE</small><strong>{item.budget_min!==null?"$"+item.budget_min?.toLocaleString():"Not supplied"} – {item.budget_max!==null?"$"+item.budget_max?.toLocaleString():"Not supplied"}</strong></div>}
 </div></section>
 <section className="cdetail__section"><h2>Before you respond</h2><p>Mark off your preparation as you review the official solicitation. This checklist is for this browser session and is not evidence of eligibility.</p><div className="cdetail__checklist">{tasks.map(([title,description],i)=><label className="cdetail__check" key={title}><input type="checkbox" checked={done.includes(i)} onChange={e=>setDone(v=>e.target.checked?[...v,i]:v.filter(x=>x!==i))}/><span><strong>{title}</strong><span>{description}</span></span></label>)}</div></section>
 </div><aside className="cdetail__aside" aria-label="Opportunity actions"><h2>Ready to take a closer look?</h2><p>{deadlineStatus}. Confirm eligibility and the current deadline with the issuing organization before you apply.</p>
 {source?<a className="cdetail__action" href={source} target="_blank" rel="noopener noreferrer">Open official notice ↗</a>:<span className="cdetail__action" aria-disabled="true">Official link unavailable</span>}
 <button className="cdetail__secondary" onClick={()=>void saveItem()} disabled={saving}>{saving?"Updating…":saved?"★ Saved to shortlist":"☆ Save to shortlist"}</button>
 <button className="cdetail__secondary" onClick={()=>void share()}>{copied?"Link copied ✓":"Copy shareable link"}</button>
 <Link href={"/report-listing?id="+encodeURIComponent(item.id)} className="cdetail__secondary" style={{textDecoration:"none",textAlign:"center"}}>Report incorrect listing</Link>
 {checkedDays===null||checkedDays>7?<div className="cdetail__warning">Source freshness needs confirmation. Review the live notice and all amendments.</div>:<p>Source checked {date(checked)}. The issuer may still change the notice.</p>}
 <div className="cdetail__source"><strong>Official source</strong><p>{source?new URL(source).hostname:"No source URL provided"}</p></div>
 </aside></div>{error&&<p className="cdetail__error" role="alert">{error}</p>}
 <p className="cdetail__foot">Crewforthat provides public procurement discovery, not a guarantee of award, eligibility or payment. No private customer information is exposed on this page.</p>
 </>}</div></main>;
}