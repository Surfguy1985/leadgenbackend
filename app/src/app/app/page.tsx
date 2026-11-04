"use client";
import { useEffect, useMemo, useState } from "react";

type Opportunity = { id:string; title:string; summary:string|null; trade:string; city:string|null; zip:string|null; deadline:string|null; official_apply_url:string|null; source_url:string|null; tab:string; last_checked_at:string|null };
type SavedItem = { id:string; opportunity_id:string };

export default function ContractorFeed() {
  const [items,setItems] = useState<Opportunity[]>([]);
  const [saved,setSaved] = useState<Record<string,string>>({});
  const [compare,setCompare] = useState<string[]>([]);
  const [tab,setTab] = useState<"jobs_now"|"upcoming"|"buyers">("jobs_now");
  const [query,setQuery] = useState("");
  const [trade,setTrade] = useState("");
  const [zip,setZip] = useState("");
  const [savingSearch,setSavingSearch] = useState(false);
  const [searchNotice,setSearchNotice] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [error,setError] = useState("");
  useEffect(() => {
    let active=true;
    setLoading(true); setError("");
    Promise.all([
      fetch("/api/public/opportunities?tab="+tab,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("opportunities unavailable");return r.json()}),
      fetch("/api/contractor/saved",{cache:"no-store"}).then(async r=>{if(r.status===401){window.location.assign("/login?next=/app");throw Error("auth required");}if(!r.ok)throw Error("saved unavailable");return r.json()})
    ]).then(([feed,bookmarks])=>{
      if(!active)return;
      setItems(Array.isArray(feed.items)?feed.items:[]);
      const next:Record<string,string>={};
      for(const item of bookmarks.items??[])next[item.opportunity_id]=item.id;
      setSaved(next);
    }).catch(()=>{if(active)setError("The feed is temporarily unavailable. Try again later.");})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[tab]);
  const filtered=useMemo(()=>items.filter(i=>
    (!query||[i.title,i.summary,i.city,i.trade,i.zip].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase().trim()))&&
    (!trade||i.trade===trade)&&(!zip||(i.zip||"").startsWith(zip))
  ),[items,query,trade,zip]);
  const trades=useMemo(()=>[...new Set(items.map(i=>i.trade))].sort(),[items]);
  async function saveSearch() {
    if (savingSearch) return;
    setSavingSearch(true); setSearchNotice("");
    const name = [tab==="jobs_now"?"Jobs Now":tab==="upcoming"?"Future Contracts":"Find Buyers",trade.replaceAll("_"," "),zip,query].filter(Boolean).join(" · ").slice(0,80);
    try {
      const r=await fetch("/api/contractor/searches",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({label:name||"Public work",tab,query,trade:trade||null,zip:zip||null})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(j.message||"This search couldn't be saved.");
      setSearchNotice("Search saved. View it in Saved Searches.");
    }catch(e){setSearchNotice(e instanceof Error?e.message:"Unable to save search.");}
    finally{setSavingSearch(false)}
  }
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const t=params.get("tab");
    if(t==="jobs_now"||t==="upcoming"||t==="buyers")setTab(t);
    setQuery((params.get("query")||"").slice(0,160));
    setZip(/^\d{0,5}$/.test(params.get("zip")||"")?(params.get("zip")||""):"");
    setTrade((params.get("trade")||"").slice(0,80));
  },[]);
  function toggleCompare(id:string){setCompare(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length<3?[...prev,id]:prev)}
  async function toggle(i:Opportunity) {
    if(busy)return;setBusy(i.id);setError("");
    try {
      const id=saved[i.id];
      const r=await fetch(id?"/api/contractor/saved?id="+encodeURIComponent(id):"/api/contractor/saved",
        id?{method:"DELETE"}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunity_id:i.id})});
      if(!r.ok)throw Error("save failed");
      const json=await r.json();
      setSaved(old=>{const updated={...old};if(id)delete updated[i.id];else updated[i.id]=json.id;return updated});
    } catch{setError("Could not update your saved opportunities. Please try again.");}
    finally{setBusy(null)}
  }
  return <main className="cf-feed"><style>{`
    .cf-feed{min-height:100svh;background:#F9F8FC;color:#25213C;padding:23px clamp(16px,5vw,75px) 85px;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif}
    .cf-feed *{box-sizing:border-box}.cf-feed__nav,.cf-feed__main{max-width:1210px;margin:auto}
    .cf-feed__nav{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;margin-bottom:32px}
    .cf-feed__brand{font-size:26px;font-weight:900;letter-spacing:-.085em;color:#26223A;text-decoration:none}.cf-feed__brand span{color:#735ADD}
    .cf-feed__navlinks{display:flex;gap:9px;flex-wrap:wrap}
    .cf-feed__navlinks a{font-size:12px;font-weight:800;padding:11px 14px;border-radius:100px;text-decoration:none;color:#554F69;background:#fff;border:1px solid #EBE7F0}
    .cf-feed__hero{padding:clamp(30px,5vw,62px);background:#EAE2FF;border-radius:32px;margin-bottom:20px}
    .cf-feed__eyebrow{color:#7257CB;font-size:11px;font-weight:850;letter-spacing:.14em}
    .cf-feed__hero h1{font-size:clamp(40px,5vw,65px);letter-spacing:-.072em;line-height:1.12;margin:16px 0 12px}.cf-feed__hero h1 span{color:#7153CB}
    .cf-feed__hero p{max-width:760px;color:#70657F;font-size:15px;line-height:1.7;margin:0}
    .cf-feed__guide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:0 0 14px}.cf-feed__guide span{background:#fff;border:1px solid #E9E5F1;border-radius:15px;padding:15px 11px;font-weight:800;font-size:12px;display:flex;align-items:center;gap:9px;justify-content:center}.cf-feed__guide b{background:#EEE9FF;color:#7256CC;width:25px;height:25px;flex:0 0 25px;border-radius:100%;display:grid;place-items:center}.cf-feed__filters{border:1px solid #E9E4F1;border-radius:25px;background:#fff;padding:22px;display:grid;grid-template-columns:1fr auto;gap:16px;margin:0 0 25px}
    .cf-feed__tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .cf-feed__tab{border:1px solid #E8E4EE;border-radius:100px;background:#F8F6FA;color:#655C76;font-size:12px;font-weight:800;padding:13px 18px;cursor:pointer}
    .cf-feed__tab[aria-selected="true"]{background:#28243E;color:#fff;border-color:#28243E}
    .cf-feed__search{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(140px,.45fr) minmax(110px,.27fr);gap:12px}.cf-feed__save-search{grid-column:1/-1;display:flex;gap:15px;align-items:center;flex-wrap:wrap}.cf-feed__save-search button{border:0;border-radius:100px;background:#29233F;color:#fff;padding:12px 20px;font-size:12px;font-weight:850;cursor:pointer}.cf-feed__save-search span{font-size:12px;color:#6F6286}
    .cf-feed__search input,.cf-feed__search select{height:48px;border-radius:13px;border:1px solid #E4DEED;padding:0 15px;background:#FCFAFD;color:#28243E;font-size:14px;min-width:0;width:100%}
    .cf-feed__counter{font-size:12px;font-weight:800;color:#7C748C;text-align:right;align-self:center}
    .cf-feed__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .cf-feed__card{background:#fff;border:1px solid #E9E5F0;border-radius:25px;padding:clamp(23px,3vw,32px);display:flex;flex-direction:column;min-height:285px}
    .cf-feed__chips{display:flex;gap:8px;flex-wrap:wrap}.cf-feed__chip{border-radius:100px;padding:9px 12px;background:#F1ECFF;color:#7158C5;font-size:10px;font-weight:850;letter-spacing:.05em}
    .cf-feed__chip--city{background:#F3F8E9;color:#5B7746}
    .cf-feed__card h2{font-size:clamp(20px,2.2vw,27px);line-height:1.25;letter-spacing:-.051em;margin:19px 0 12px;overflow-wrap:anywhere}.cf-feed__title-link{color:inherit;text-decoration:none}.cf-feed__title-link:hover{color:#7056D5}.cf-feed__title-link:focus-visible{outline:3px solid #7759DA;outline-offset:4px}
    .cf-feed__card p{font-size:14px;line-height:1.65;color:#7A7485;margin:0 0 18px}
    .cf-feed__details{font-size:12px;color:#8A8192;line-height:1.55;margin-bottom:16px}
    .cf-feed__actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid #F0EDF4;margin-top:auto;padding-top:20px}
    .cf-feed__apply{display:inline-flex;padding:14px 19px;background:#28243F;color:#fff;text-decoration:none;font-size:12px;font-weight:850;border-radius:100px}
    .cf-feed__save{border:1px solid #E7E1EE;border-radius:100px;background:#fff;color:#655B76;padding:13px 18px;font-size:12px;font-weight:850;cursor:pointer}
    .cf-feed__save[aria-pressed="true"]{background:#EAE4FF;border-color:#BBA8F5;color:#5E43BF}
    .cf-feed__save:disabled{opacity:.6;cursor:wait}.cf-feed__compare{border:1px solid #E8E1EF;background:#fff;border-radius:100px;font-size:12px;font-weight:850;color:#594F70;padding:13px 17px;cursor:pointer}.cf-feed__compare[aria-pressed="true"]{background:#EDF7E7;color:#3C713B;border-color:#CEECBD}.cf-feed__compare:disabled{opacity:.5;cursor:not-allowed}
    .cf-feed__compare-tray{position:sticky;bottom:15px;margin:20px auto 0;z-index:10;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;border:1px solid #D6CBEE;background:#28233F;color:#fff;border-radius:23px;padding:17px 21px;box-shadow:0 17px 45px rgba(33,23,67,.22)}
    .cf-feed__compare-tray strong{font-size:14px}.cf-feed__compare-tray span{font-size:12px;color:#DCD5F3}
    .cf-feed__compare-tray a{padding:13px 18px;border-radius:100px;text-decoration:none;background:#CFF2A8;color:#293E2C;font-weight:850;font-size:12px}.cf-feed__compare-tray button{border:0;background:transparent;color:white;font-size:12px;font-weight:800;cursor:pointer}.cf-feed__report{font-size:11px;color:#8C8499;text-decoration:underline;align-self:center;text-underline-offset:3px}
    .cf-feed__empty{border:1px dashed #D7CBF1;border-radius:25px;background:#F5F0FF;padding:38px;font-size:14px;color:#756D84;line-height:1.6}.cf-feed__empty h2{color:#25213C;font-size:27px;letter-spacing:-.04em;margin:0 0 10px}
    .cf-feed__error{background:#FFF0EA;border-radius:14px;padding:17px;color:#8B4133}
    .cf-feed__footnote{margin:25px 0 0;color:#938C9B;font-size:12px;line-height:1.65}
    @media(max-width:800px){.cf-feed__grid{grid-template-columns:1fr}.cf-feed__filters{grid-template-columns:1fr}.cf-feed__counter{text-align:left}.cf-feed__search{grid-template-columns:1fr}}
    @media(max-width:480px){.cf-feed__guide span{font-size:10px;padding:12px 6px;gap:5px}.cf-feed__guide b{width:20px;height:20px;flex-basis:20px}.cf-feed__hero{padding:29px 25px;border-radius:25px}.cf-feed__card{padding:23px}.cf-feed__actions>*{flex:1;text-align:center;justify-content:center}.cf-feed__navlinks a{font-size:11px}}
  `}</style>
  <nav className="cf-feed__nav"><a href="https://lead-gen-site-dc4966.webflow.io/" className="cf-feed__brand">crew<span>for</span>that.</a><div className="cf-feed__navlinks"><a href="/dashboard">Dashboard</a><a href="/app/pipeline">My next steps</a><a href="/app/profile">Crew readiness</a><a href="/app/saved">Saved jobs</a><a href="/app/searches">Saved searches</a><a href="/app/settings">Settings</a></div></nav>
  <div className="cf-feed__main"><header className="cf-feed__hero"><span className="cf-feed__eyebrow">YOUR OPPORTUNITY DISCOVERY</span><h1>Find your next job.</h1><p>Pick a job. Save it. We’ll help you decide what to do next.</p></header>
    <div className="cf-feed__guide" aria-label="How it works"><span><b>1</b> Find work</span><span><b>2</b> Save a job</span><span><b>3</b> Take action</span></div>
    <section className="cf-feed__filters" aria-label="Opportunity filters">
      <div className="cf-feed__tabs" role="tablist" aria-label="Opportunity category">
        {([["jobs_now","Jobs Now"],["upcoming","Future Contracts"],["buyers","Find Buyers"]] as const).map(([value,label])=><button type="button" role="tab" aria-selected={tab===value} className="cf-feed__tab" key={value} onClick={()=>setTab(value)}>{label}</button>)}
      </div>
      <span className="cf-feed__counter" aria-live="polite">{filtered.length} approved records</span>
      <div className="cf-feed__search"><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects, trades, or cities" aria-label="Search opportunities"/><select aria-label="Filter by trade" value={trade} onChange={e=>setTrade(e.target.value)}><option value="">All trades</option>{trades.map(t=><option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}</select><input inputMode="numeric" value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} aria-label="Filter by five digit ZIP" placeholder="ZIP code" maxLength={5}/></div><div className="cf-feed__save-search"><button type="button" onClick={()=>void saveSearch()} disabled={savingSearch}>{savingSearch?"Saving search…":"Save these filters ☆"}</button><span role="status">{searchNotice}</span></div>
    </section>
    {error&&<p className="cf-feed__error" role="alert">{error}</p>}
    {loading?<p role="status">Loading official opportunities…</p>:filtered.length?
      <div className="cf-feed__grid">{filtered.map(item=><article className="cf-feed__card" key={item.id}>
        <div className="cf-feed__chips"><span className="cf-feed__chip">OFFICIAL PUBLIC NOTICE</span><span className="cf-feed__chip cf-feed__chip--city">{item.city||item.zip||"Texas"}</span></div>
        <h2><a className="cf-feed__title-link" href={"/app/opportunity/"+encodeURIComponent(item.id)}>{item.title}</a></h2><p>{item.summary||"Review the official solicitation for scope, eligibility and requirements."}</p>
        <div className="cf-feed__details">Trade: {item.trade.replaceAll("_"," ")} · {item.deadline?"Deadline "+new Date(item.deadline).toLocaleDateString("en-US"):"Confirm deadline with the official source"}</div>
        <div className="cf-feed__actions"><a className="cf-feed__apply" href={"/app/opportunity/"+encodeURIComponent(item.id)}>Review opportunity ↗</a><button type="button" className="cf-feed__save" disabled={busy===item.id} aria-pressed={!!saved[item.id]} onClick={()=>void toggle(item)}>{busy===item.id?"Saving…":saved[item.id]?"★ Saved":"☆ Save"}</button><button type="button" className="cf-feed__compare" disabled={compare.length>=3&&!compare.includes(item.id)} aria-pressed={compare.includes(item.id)} onClick={()=>toggleCompare(item.id)}>{compare.includes(item.id)?"✓ Comparing":"+ Compare"}</button><a className="cf-feed__report" href={"/report-listing?id="+encodeURIComponent(item.id)}>Report issue</a></div>
      </article>)}</div>:
      <section className="cf-feed__empty"><h2>No verified opportunities match right now.</h2><p>Try a broader trade or location. We don't add placeholder job listings or invent open contracts.</p><button className="cf-feed__save" onClick={()=>{setQuery("");setTrade("");setZip("")}}>Clear filters</button></section>}
    {compare.length>0&&<aside className="cf-feed__compare-tray" role="region" aria-label="Selected opportunities for comparison"><div><strong>Compare opportunities</strong><br/><span>{compare.length} of 3 selected</span></div><a href={"/app/compare?ids="+encodeURIComponent(compare.join(","))}>Compare side by side ↗</a><button type="button" onClick={()=>setCompare([])}>Clear selection</button></aside>}
    <p className="cf-feed__footnote">Public bids do not guarantee work. Source deadlines, changes, eligibility and official application requirements always take priority.</p>
  </div></main>;
}
