"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Stage="saved"|"researching"|"estimating"|"ready"|"submitted"|"won"|"lost"|"archived";
type Bid={id:string;opportunity_id:string;stage:Stage;note:string|null;next_action:string|null;action_due_at:string|null;estimated_bid:number|null;submitted_at:string|null;opportunity:{id:string;title:string;trade:string;city:string|null;deadline:string|null}};
const stages:[Stage,string][]=[["saved","Saved"],["researching","Researching"],["estimating","Estimating"],["ready","Ready"],["submitted","Submitted"],["won","Won"],["lost","Lost"],["archived","Archived"]];
const nextSteps=["Review requirements","Get an estimate","Call the issuing agency","Prepare documents","Submit bid","Follow up"];
function date(v:string|null){if(!v)return "Not set";const d=new Date(v);return Number.isNaN(d.getTime())?"Not set":d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function asInput(v:string|null){if(!v)return "";const d=new Date(v);if(Number.isNaN(d.getTime()))return "";const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
export default function Pipeline(){
 const [items,setItems]=useState<Bid[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [selected,setSelected]=useState<Bid|null>(null),[stage,setStage]=useState<Stage>("saved"),[action,setAction]=useState(""),[due,setDue]=useState(""),[note,setNote]=useState(""),[saving,setSaving]=useState(false),[showMore,setShowMore]=useState(false);
 async function load(){setLoading(true);setError("");try{const r=await fetch("/api/contractor/saved",{cache:"no-store"});if(r.status===401){window.location.assign("/login?next=/app/pipeline");return;}if(!r.ok)throw Error("Couldn't load your work list.");const j=await r.json();setItems(j.items||[]);}catch(e){setError(e instanceof Error?e.message:"Unable to load saved jobs.");}finally{setLoading(false)}}
 useEffect(()=>{void load();},[]);
 const active=useMemo(()=>items.filter(x=>!["won","lost","archived"].includes(x.stage)),[items]);
 const next=useMemo(()=>active.filter(x=>x.action_due_at).sort((a,b)=>new Date(a.action_due_at!).getTime()-new Date(b.action_due_at!).getTime()),[active]);
 function edit(item:Bid){setSelected(item);setStage(item.stage);setAction(item.next_action||"");setDue(asInput(item.action_due_at));setNote(item.note||"");setShowMore(false);setError("");}
 async function save(){if(!selected||saving)return;setSaving(true);setError("");try{
  const r=await fetch("/api/contractor/saved",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:selected.id,stage,next_action:action.trim()||null,action_due_at:due?new Date(due).toISOString():null,note:note.trim()||null})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||"Couldn't save changes.");
  setItems(v=>v.map(x=>x.id===selected.id?{...x,stage,next_action:action.trim()||null,action_due_at:due?new Date(due).toISOString():null,note:note.trim()||null}:x));
  setSelected(null);
 }catch(e){setError(e instanceof Error?e.message:"Couldn't save changes.");}finally{setSaving(false)}}
 const overdue=(v:string|null)=>!!v&&new Date(v).getTime()<Date.now();
 return <main className="cftp">
 <style>{`
 .cftp{min-height:100svh;background:#FAF9FC;color:#27233D;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;padding:18px clamp(14px,4vw,58px) 90px}
 .cftp *{box-sizing:border-box}.cftp__nav,.cftp__main{max-width:1100px;margin:auto}
 .cftp__nav{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:26px}
 .cftp__logo{font-weight:900;font-size:24px;letter-spacing:-.075em;text-decoration:none;color:#28243F}.cftp__logo span{color:#765BDC}
 .cftp__navlinks{display:flex;gap:8px;flex-wrap:wrap}.cftp__navlinks a{border-radius:100px;padding:11px 15px;background:#fff;border:1px solid #EBE5F1;font-weight:800;font-size:12px;text-decoration:none;color:#5D5570}
 .cftp__hero{border-radius:29px;padding:clamp(27px,5vw,53px);background:#EAE2FF;margin-bottom:18px}
 .cftp__eyebrow{font-size:11px;letter-spacing:.12em;color:#7357CA;font-weight:850}.cftp__hero h1{font-size:clamp(39px,5vw,60px);line-height:1.11;letter-spacing:-.073em;margin:14px 0 11px}
 .cftp__hero p{color:#6D637E;line-height:1.6;font-size:15px;margin:0}
 .cftp__steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:15px 0 27px}
 .cftp__step{border-radius:17px;padding:16px 18px;background:#fff;border:1px solid #ECE7F2;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:800}
 .cftp__step b{display:grid;place-items:center;border-radius:100%;width:29px;height:29px;flex:0 0 29px;color:#6F55D1;background:#EEE9FF;font-size:12px}
 .cftp__step[data-step="active"]{border-color:#C8B7F9;background:#F6F2FF}
 .cftp__heading{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;margin:0 0 17px}.cftp__heading h2{font-size:25px;letter-spacing:-.055em;margin:0}.cftp__heading span{font-size:12px;color:#898191;font-weight:750}
 .cftp__list{display:grid;gap:11px}.cftp__card{border-radius:20px;background:#fff;border:1px solid #E9E4F0;padding:22px;display:flex;align-items:center;justify-content:space-between;gap:17px}
 .cftp__cardcontent{min-width:0;flex:1}.cftp__label{display:inline-block;border-radius:100px;padding:8px 11px;background:#F0ECFF;color:#6650BA;font-size:10px;font-weight:850;margin-bottom:10px}
 .cftp__card h3{font-size:19px;line-height:1.25;letter-spacing:-.045em;margin:0 0 8px;overflow-wrap:anywhere}.cftp__meta{color:#81798C;font-size:12px;line-height:1.55}
 .cftp__next{color:#5B526C;font-size:13px;line-height:1.55;margin:10px 0 0}.cftp__next strong{color:#2B2740}.cftp__date{font-size:12px;color:#776B84}.cftp__date[data-overdue="true"]{color:#B65E3F}
 .cftp__button,.cftp__primary{border:0;background:#28243F;border-radius:100px;color:#fff;text-decoration:none;padding:14px 21px;font-size:12px;font-weight:850;cursor:pointer;white-space:nowrap}
 .cftp__button:hover,.cftp__primary:hover{background:#7156D5}.cftp__primary:disabled{opacity:.6;cursor:wait}
 .cftp__empty{border:1px dashed #D7CCED;background:#fff;border-radius:24px;padding:35px}.cftp__empty h2{font-size:26px;letter-spacing:-.05em;margin:0 0 10px}.cftp__empty p{color:#7C7488;line-height:1.65;font-size:14px}.cftp__empty a{display:inline-block;background:#28243F;border-radius:100px;padding:14px 20px;color:#fff;text-decoration:none;font-size:12px;font-weight:800}
 .cftp__hint{font-size:12px;line-height:1.7;color:#888093;margin-top:18px}.cftp__error{background:#FFF0EA;color:#8A4736;border-radius:14px;padding:15px;font-size:13px}
 .cftp__backdrop{position:fixed;inset:0;background:rgba(22,17,42,.52);z-index:100;display:flex;justify-content:center;align-items:center;padding:16px;overflow-y:auto}
 .cftp__dialog{width:min(100%,530px);max-height:calc(100svh - 32px);overflow:auto;background:#fff;border-radius:29px;padding:clamp(25px,4vw,37px);box-shadow:0 25px 100px rgba(20,12,55,.23)}
 .cftp__dialogtag{color:#7358D1;font-size:10px;font-weight:850;letter-spacing:.12em}.cftp__dialog h2{font-size:28px;letter-spacing:-.055em;margin:14px 0 10px}.cftp__dialog p{font-size:13px;color:#7F7789;line-height:1.6}
 .cftp__form{display:grid;gap:17px;margin-top:24px}.cftp__field{display:grid;gap:8px}.cftp__field label{font-size:11px;letter-spacing:.06em;color:#554B68;font-weight:850}
 .cftp__field input,.cftp__field select,.cftp__field textarea{min-height:49px;padding:13px 14px;border:1px solid #E5DFEC;border-radius:13px;background:#FCFAFD;font-size:14px;font-family:inherit;color:#28243D;width:100%}.cftp__field textarea{resize:vertical}
 .cftp__actions{display:flex;flex-wrap:wrap;gap:9px}.cftp__actions button{flex:1;min-width:120px}
 .cftp__secondary{border:1px solid #E5DDF0;background:#fff;border-radius:100px;padding:13px 17px;font-size:12px;font-weight:800;color:#605470;cursor:pointer}
 .cftp__more{border:0;background:none;color:#6D55CF;text-align:left;font-weight:850;font-size:12px;cursor:pointer;padding:5px 0}
 @media(max-width:680px){.cftp__card{align-items:flex-start;flex-direction:column}.cftp__button{width:100%;text-align:center}.cftp__steps{grid-template-columns:1fr 1fr 1fr}.cftp__step{padding:13px 9px;gap:6px;font-size:11px}.cftp__step b{width:23px;height:23px;flex-basis:23px}.cftp__hero{border-radius:23px}}
 @media(max-width:410px){.cftp__step{font-size:10px}.cftp__step b{display:none}.cftp__actions{flex-direction:column}}
 @media(prefers-reduced-motion:reduce){.cftp *{transition:none!important;animation:none!important}}
 `}</style>
 <nav className="cftp__nav"><Link className="cftp__logo" href="/app">crew<span>for</span>that.</Link><div className="cftp__navlinks"><Link href="/app">Find work</Link><Link href="/app/saved">Saved jobs</Link></div></nav>
 <div className="cftp__main"><header className="cftp__hero"><span className="cftp__eyebrow">YOUR WORK PLAN</span><h1>What's next?</h1><p>Every saved job. One clear next step.</p></header>
 <div className="cftp__steps" aria-label="Simple work-finding steps"><div className="cftp__step"><b>1</b>Find work</div><div className="cftp__step"><b>2</b>Save jobs</div><div className="cftp__step" data-step="active"><b>3</b>Take action</div></div>
 {error&&<p className="cftp__error" role="alert">{error}</p>}
 <div className="cftp__heading"><h2>Your next actions</h2><span>{active.length} active {active.length===1?"job":"jobs"}</span></div>
 {loading?<p role="status">Loading your jobs…</p>:active.length?<div className="cftp__list">{[...active].sort((a,b)=>(a.action_due_at?new Date(a.action_due_at).getTime():Number.MAX_SAFE_INTEGER)-(b.action_due_at?new Date(b.action_due_at).getTime():Number.MAX_SAFE_INTEGER)).map(x=><article className="cftp__card" key={x.id}><div className="cftp__cardcontent"><span className="cftp__label">{stages.find(([v])=>v===x.stage)?.[1]||"Saved"}</span><h3>{x.opportunity.title}</h3><div className="cftp__meta">{[x.opportunity.trade.replaceAll("_"," "),x.opportunity.city].filter(Boolean).join(" · ")} {x.opportunity.deadline?" · Bid deadline "+date(x.opportunity.deadline):""}</div><p className="cftp__next"><strong>Next: </strong>{x.next_action||"Review this job"}</p>{x.action_due_at&&<span className="cftp__date" data-overdue={overdue(x.action_due_at)}>{overdue(x.action_due_at)?"Past due: ":"Planned: "}{date(x.action_due_at)}</span>}</div><button className="cftp__button" onClick={()=>edit(x)}>Update next step →</button></article>)}</div>:
 <div className="cftp__empty"><h2>No jobs in progress.</h2><p>Find a job you like, tap Save, and it will appear here.</p><Link href="/app">Find your first job →</Link></div>}
 <p className="cftp__hint">This is your private work plan. Statuses and dates are your notes—not verified bid submissions or awards.</p>
 </div>
 {selected&&<div className="cftp__backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null)}}>
 <section className="cftp__dialog" role="dialog" aria-modal="true" aria-labelledby="cftp-dialog-heading">
 <span className="cftp__dialogtag">ONE JOB · ONE NEXT STEP</span><h2 id="cftp-dialog-heading">What will you do next?</h2><p>{selected.opportunity.title}</p>
 <div className="cftp__form">
 <div className="cftp__field"><label htmlFor="cftp-action">NEXT STEP</label><select id="cftp-action" value={nextSteps.includes(action)||!action?action:"other"} onChange={e=>setAction(e.target.value==="other"?"":e.target.value)}><option value="">Choose your next step</option>{nextSteps.map(a=><option value={a} key={a}>{a}</option>)}<option value="other">Write my own…</option></select></div>
 {!nextSteps.includes(action)&&<div className="cftp__field"><label htmlFor="cftp-custom">YOUR NEXT STEP</label><input id="cftp-custom" maxLength={220} value={action} onChange={e=>setAction(e.target.value)} placeholder="What needs to happen?"/></div>}
 <div className="cftp__field"><label htmlFor="cftp-due">WHEN? (OPTIONAL)</label><input type="datetime-local" id="cftp-due" value={due} onChange={e=>setDue(e.target.value)}/></div>
 <button className="cftp__more" type="button" aria-expanded={showMore} onClick={()=>setShowMore(!showMore)}>{showMore?"− Hide extra details":"+ More options (optional)"}</button>
 {showMore&&<><div className="cftp__field"><label htmlFor="cftp-stage">BID STAGE</label><select value={stage} id="cftp-stage" onChange={e=>setStage(e.target.value as Stage)}>{stages.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></div><div className="cftp__field"><label htmlFor="cftp-note">PRIVATE NOTE</label><textarea id="cftp-note" maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="A detail you don't want to forget"/></div></>}
 <div className="cftp__actions"><button className="cftp__secondary" type="button" onClick={()=>setSelected(null)} disabled={saving}>Cancel</button><button className="cftp__primary" type="button" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save next step →"}</button></div>
 </div>
 </section></div>}
 </main>;
}