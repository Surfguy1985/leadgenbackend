"use client";
import { useEffect, useMemo, useState } from "react";

type Opportunity = { id:string; title:string; summary:string|null; trade:string; city:string|null; zip:string|null; deadline:string|null; official_apply_url:string|null; source_url:string|null; tab:string; last_checked_at:string|null };
type SavedItem = { id:string; opportunity_id:string };

export default function ContractorFeed() {
  const [items,setItems] = useState<Opportunity[]>([]);
  const [saved,setSaved] = useState<Record<string,string>>({});
  const [tab,setTab] = useState<"jobs_now"|"upcoming"|"buyers">("jobs_now");
  const [query,setQuery] = useState("");
  const [trade,setTrade] = useState("");
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
    (!trade||i.trade===trade)
  ),[items,query,trade]);
  const trades=useMemo(()=>[...new Set(items.map(i=>i.trade))].sort(),[items]);
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
    .cf-feed__filters{border:1px solid #E9E4F1;border-radius:25px;background:#fff;padding:22px;display:grid;grid-template-columns:1fr auto;gap:16px;margin:0 0 25px}
    .cf-feed__tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .cf-feed__tab{border:1px solid #E8E4EE;border-radius:100px;background:#F8F6FA;color:#655C76;font-size:12px;font-weight:800;padding:13px 18px;cursor:pointer}
    .cf-feed__tab[aria-selected="true"]{background:#28243E;color:#fff;border-color:#28243E}
    .cf-feed__search{grid-column:1/-1;display:grid;grid-template-columns:1fr minmax(150px,.32fr);gap:12px}
    .cf-feed__search input,.cf-feed__search select{height:48px;border-radius:13px;border:1px solid #E4DEED;padding:0 15px;background:#FCFAFD;color:#28243E;font-size:14px;min-width:0;width:100%}
    .cf-feed__counter{font-size:12px;font-weight:800;color:#7C748C;text-align:right;align-self:center}
    .cf-feed__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .cf-feed__card{background:#fff;border:1px solid #E9E5F0;border-radius:25px;padding:clamp(23px,3vw,32px);display:flex;flex-direction:column;min-height:285px}
    .cf-feed__chips{display:flex;gap:8px;flex-wrap:wrap}.cf-feed__chip{border-radius:100px;padding:9px 12px;background:#F1ECFF;color:#7158C5;font-size:10px;font-weight:850;letter-spacing:.05em}
    .cf-feed__chip--city{background:#F3F8E9;color:#5B7746}
    .cf-feed__card h2{font-size:clamp(20px,2.2vw,27px);line-height:1.25;letter-spacing:-.051em;margin:19px 0 12px;overflow-wrap:anywhere}
    .cf-feed__card p{font-size:14px;line-height:1.65;color:#7A7485;margin:0 0 18px}
    .cf-feed__details{font-size:12px;color:#8A8192;line-height:1.55;margin-bottom:16px}
    .cf-feed__actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid #F0EDF4;margin-top:auto;padding-top:20px}
    .cf-feed__apply{display:inline-flex;padding:14px 19px;background:#28243F;color:#fff;text-decoration:none;font-size:12px;font-weight:850;border-radius:100px}
    .cf-feed__save{border:1px solid #E7E1EE;border-radius:100px;background:#fff;color:#655B76;padding:13px 18px;font-size:12px;font-weight:850;cursor:pointer}
    .cf-feed__save[aria-pressed="true"]{background:#EAE4FF;border-color:#BBA8F5;color:#5E43BF}
    .cf-feed__save:disabled{opacity:.6;cursor:wait}
    .cf-feed__empty{border:1px dashed #D7CBF1;border-radius:25px;background:#F5F0FF;padding:38px;font-size:14px;color:#756D84;line-height:1.6}.cf-feed__empty h2{color:#25213C;font-size:27px;letter-spacing:-.04em;margin:0 0 10px}
    .cf-feed__error{background:#FFF0EA;border-radius:14px;padding:17px;color:#8B4133}
    .cf-feed__footnote{margin:25px 0 0;color:#938C9B;font-size:12px;line-height:1.65}
    @media(max-width:800px){.cf-feed__grid{grid-template-columns:1fr}.cf-feed__filters{grid-template-columns:1fr}.cf-feed__counter{text-align:left}.cf-feed__search{grid-template-columns:1fr}}
    @media(max-width:480px){.cf-feed__hero{padding:29px 25px;border-radius:25px}.cf-feed__card{padding:23px}.cf-feed__actions>*{flex:1;text-align:center;justify-content:center}.cf-feed__navlinks a{font-size:11px}}
  `}</style>
  <nav className="cf-feed__nav"><a href="https://lead-gen-site-dc4966.webflow.io/" className="cf-feed__brand">crew<span>for</span>that.</a><div className="cf-feed__navlinks"><a href="/dashboard">Dashboard</a><a href="/app/saved">Saved</a><a href="/app/settings">Settings</a></div></nav>
  <div className="cf-feed__main"><header className="cf-feed__hero"><span className="cf-feed__eyebrow">YOUR OPPORTUNITY DISCOVERY</span><h1>Find work <span>your way.</span></h1><p>Search official public opportunities, save promising bids, and build a shortlist. All applications go to the original issuing organization.</p></header>
    <section className="cf-feed__filters" aria-label="Opportunity filters">
      <div className="cf-feed__tabs" role="tablist" aria-label="Opportunity category">
        {([["jobs_now","Jobs Now"],["upcoming","Future Contracts"],["buyers","Find Buyers"]] as const).map(([value,label])=><button type="button" role="tab" aria-selected={tab===value} className="cf-feed__tab" key={value} onClick={()=>setTab(value)}>{label}</button>)}
      </div>
      <span className="cf-feed__counter" aria-live="polite">{filtered.length} approved records</span>
      <div className="cf-feed__search"><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects, trades, or cities" aria-label="Search opportunities"/><select aria-label="Filter by trade" value={trade} onChange={e=>setTrade(e.target.value)}><option value="">All trades</option>{trades.map(t=><option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}</select></div>
    </section>
    {error&&<p className="cf-feed__error" role="alert">{error}</p>}
    {loading?<p role="status">Loading official opportunities…</p>:filtered.length?
      <div className="cf-feed__grid">{filtered.map(item=><article className="cf-feed__card" key={item.id}>
        <div className="cf-feed__chips"><span className="cf-feed__chip">OFFICIAL PUBLIC NOTICE</span><span className="cf-feed__chip cf-feed__chip--city">{item.city||item.zip||"Texas"}</span></div>
        <h2>{item.title}</h2><p>{item.summary||"Review the official solicitation for scope, eligibility and requirements."}</p>
        <div className="cf-feed__details">Trade: {item.trade.replaceAll("_"," ")} · {item.deadline?"Deadline "+new Date(item.deadline).toLocaleDateString("en-US"):"Confirm deadline with the official source"}</div>
        <div className="cf-feed__actions"><a className="cf-feed__apply" href={item.official_apply_url||item.source_url||"#"} target="_blank" rel="noopener noreferrer">Official notice ↗</a><button type="button" className="cf-feed__save" disabled={busy===item.id} aria-pressed={!!saved[item.id]} onClick={()=>void toggle(item)}>{busy===item.id?"Saving…":saved[item.id]?"★ Saved":"☆ Save"}</button></div>
      </article>)}</div>:
      <section className="cf-feed__empty"><h2>No verified opportunities match right now.</h2><p>Try a broader trade or location. We don't add placeholder job listings or invent open contracts.</p><button className="cf-feed__save" onClick={()=>{setQuery("");setTrade("")}}>Clear filters</button></section>}
    <p className="cf-feed__footnote">Public bids do not guarantee work. Source deadlines, changes, eligibility and official application requirements always take priority.</p>
  </div></main>;
}
