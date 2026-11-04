"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
type Bid={id:string;title:string;summary:string|null;trade:string;city:string|null;state:string|null;zip:string|null;deadline:string|null;budget_min:number|null;budget_max:number|null;official_apply_url:string|null;source_url:string|null;last_checked_at:string|null;last_verified_at:string|null;property_type:string|null};
function date(v:string|null){if(!v)return "Not specified";const d=new Date(v);return Number.isNaN(d.valueOf())?"Not specified":d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function https(v:string|null){if(!v)return null;try{const u=new URL(v);return u.protocol==="https:"||u.protocol==="http:"?u.href:null}catch{return null}}
function CompareContent(){
 const params=useSearchParams(),ids=useMemo(()=>[...new Set((params.get("ids")||"").split(",").filter(x=>/^[0-9a-f-]{36}$/i.test(x)))].slice(0,3),[params]);
 const [items,setItems]=useState<Bid[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let live=true;setLoading(true);setError("");
  Promise.all(ids.map(id=>fetch("/api/public/opportunities/"+encodeURIComponent(id),{cache:"no-store"}).then(async r=>r.ok?(await r.json()).opportunity:null)))
  .then(rows=>{if(live)setItems(rows.filter(Boolean))}).catch(()=>{if(live)setError("The comparison could not be loaded. Please try again.")})
  .finally(()=>{if(live)setLoading(false)});return()=>{live=false};
 },[ids]);
 const rows:[string,(x:Bid)=>string][]=[
  ["Service / trade",x=>x.trade.replaceAll("_"," ")],
  ["City and area",x=>[x.city,x.state,x.zip].filter(Boolean).join(", ")||"Not specified"],
  ["Property type",x=>x.property_type||"Not specified"],
  ["Listed deadline",x=>date(x.deadline)],
  ["Listed budget",x=>x.budget_min!==null||x.budget_max!==null?[x.budget_min===null?"—":"$"+x.budget_min.toLocaleString(),x.budget_max===null?"—":"$"+x.budget_max.toLocaleString()].join(" – "):"Not specified"],
  ["Last source check",x=>date(x.last_checked_at||x.last_verified_at)],
  ["Source link",x=>{const u=https(x.official_apply_url)||https(x.source_url);return u?new URL(u).hostname:"Unavailable"}],
 ];
 return <div>{error&&<p className="cfcompare__error" role="alert">{error}</p>}
 {loading?<p role="status">Loading your comparison…</p>:items.length===0?<section className="cfcompare__empty"><h2>Choose opportunities to compare.</h2><p>Return to Find Work and select two or three real public notices.</p><Link href="/app">Browse jobs ↗</Link></section>:
 <div className="cfcompare__tablewrap" role="region" aria-label="Comparison of public procurement opportunities" tabIndex={0}><table className="cfcompare__table"><caption className="cfcompare__caption">A source-based comparison, not a verified contractor qualification or winning-probability estimate.</caption><thead><tr><th scope="col">Decision factor</th>{items.map(x=><th scope="col" key={x.id}><span className="cfcompare__tag">PUBLIC NOTICE</span><strong>{x.title}</strong><Link href={"/app/opportunity/"+encodeURIComponent(x.id)}>View details ↗</Link></th>)}</tr></thead><tbody>{rows.map(([label,get])=><tr key={label}><th scope="row">{label}</th>{items.map(x=><td key={x.id}>{get(x)}</td>)}</tr>)}
 <tr><th scope="row">Best next step</th>{items.map(x=><td key={x.id}>{https(x.official_apply_url)||https(x.source_url)?<a className="cfcompare__action" href={https(x.official_apply_url)||https(x.source_url)||"#"} target="_blank" rel="noopener noreferrer">Official notice ↗</a>:"No valid link; report this listing"}</td>)}</tr></tbody></table></div>}
 </div>;
}
export default function ComparePage(){return <main className="cfcompare"><style>{`
.cfcompare{min-height:100svh;background:#F9F8FC;color:#28243F;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;padding:24px clamp(15px,4vw,58px) 88px}.cfcompare *{box-sizing:border-box}
.cfcompare__nav,.cfcompare__wrap{max-width:1280px;margin:0 auto}.cfcompare__nav{display:flex;justify-content:space-between;align-items:center;gap:17px;flex-wrap:wrap;margin-bottom:30px}
.cfcompare__logo{text-decoration:none;font-size:26px;letter-spacing:-.08em;font-weight:900;color:#29243F}.cfcompare__logo span{color:#7459DC}
.cfcompare__back{padding:12px 18px;border:1px solid #E9E3EF;background:#fff;border-radius:100px;font-size:12px;font-weight:800;text-decoration:none;color:#5F566D}
.cfcompare__hero{background:#E9E2FF;border-radius:30px;padding:clamp(29px,5vw,61px);margin-bottom:21px}
.cfcompare__eyebrow{font-size:11px;letter-spacing:.13em;color:#7355C8;font-weight:850}
.cfcompare__hero h1{font-size:clamp(39px,5vw,64px);letter-spacing:-.071em;line-height:1.13;margin:17px 0 12px}
.cfcompare__hero p{font-size:14px;line-height:1.7;color:#706782;max-width:800px;margin:0}
.cfcompare__tablewrap{overflow-x:auto;background:#fff;border:1px solid #E9E4EE;border-radius:26px;box-shadow:0 14px 42px rgba(40,26,77,.04)}
.cfcompare__table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:750px}
.cfcompare__caption{text-align:left;padding:20px 24px;font-size:12px;color:#82798A;caption-side:bottom}
.cfcompare__table th,.cfcompare__table td{text-align:left;vertical-align:top;padding:20px 22px;border-bottom:1px solid #EEEAF2;overflow-wrap:anywhere;line-height:1.55}
.cfcompare__table thead th{background:#F3EEFF;font-size:13px;font-weight:800}
.cfcompare__table thead th:first-child{width:175px;color:#655A75}
.cfcompare__table thead strong{display:block;color:#29243D;line-height:1.28;font-size:18px;letter-spacing:-.04em;margin:15px 0}
.cfcompare__table thead a{color:#6D50CD;font-size:12px;font-weight:800;text-decoration:none}
.cfcompare__table tbody th{background:#FBFAFC;color:#675D78;font-size:12px;font-weight:800}
.cfcompare__table tbody td{font-size:13px;color:#554D68}
.cfcompare__tag{border-radius:100px;background:#E3D9FF;color:#6A4FC4;font-size:10px;letter-spacing:.07em;padding:8px 11px;display:inline-block}
.cfcompare__action{display:inline-block;background:#2A253F;color:#fff;text-decoration:none;border-radius:100px;font-size:12px;font-weight:800;padding:13px 17px}
.cfcompare__empty{background:#fff;border:1px dashed #D8CEED;border-radius:24px;padding:36px;color:#70657C}.cfcompare__empty h2{color:#29243D;font-size:29px;letter-spacing:-.05em}
.cfcompare__empty a{display:inline-block;background:#29243D;color:#fff;text-decoration:none;padding:14px 18px;border-radius:100px;font-weight:800;font-size:13px}
.cfcompare__error{background:#FFF0E9;color:#8D4437;border-radius:14px;padding:17px}
@media(max-width:650px){.cfcompare__hero{border-radius:24px;padding:29px 24px}.cfcompare__tablewrap{border-radius:18px}.cfcompare__table th,.cfcompare__table td{padding:17px 15px}}
`}</style>
<nav className="cfcompare__nav"><Link href="/app" className="cfcompare__logo">crew<span>for</span>that.</Link><Link href="/app" className="cfcompare__back">← Back to work</Link></nav>
<div className="cfcompare__wrap"><header className="cfcompare__hero"><span className="cfcompare__eyebrow">YOUR DECISION DESK / SIDE-BY-SIDE</span><h1>Compare before you commit.</h1><p>Use real source attributes to decide which bids deserve your time. Missing budgets, deadlines and contact details are labeled as unavailable rather than guessed.</p></header><Suspense fallback={<p>Preparing comparison…</p>}><CompareContent/></Suspense></div></main>}
