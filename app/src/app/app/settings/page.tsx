"use client";
import { useEffect, useState, type FormEvent } from "react";
type Frequency = "off" | "daily" | "weekly";
type Tab = "jobs_now" | "upcoming" | "buyers";
export default function ContractorSettings() {
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [tabs, setTabs] = useState<Tab[]>(["jobs_now"]);
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/contractor/preferences", { cache: "no-store" }).then(async res => {
      if(res.status===401){window.location.assign("/login?next=/app/settings");return null;}
      if(!res.ok)throw Error("unavailable");return res.json();
    }).then(j=>{if(!j)return;const p=j.preferences;setFrequency(p.frequency==="daily"||p.frequency==="off"?p.frequency:"weekly");setTabs(p.tabs?.length?p.tabs:["jobs_now"]);setLanguage(p.language==="es"?"es":"en");setMarketing(p.marketing_optin===true);}).catch(()=>setMessage("Preferences could not be loaded.")).finally(()=>setLoading(false));
  },[]);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(saving||!tabs.length)return;setSaving(true);setMessage("");
    try{const r=await fetch("/api/contractor/preferences",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({frequency,tabs,language,marketing_optin:marketing})});if(!r.ok)throw Error("save");setMessage("Preferences saved.");}
    catch{setMessage("We couldn't save your changes. Please try again.");}finally{setSaving(false)}
  }
  function toggle(tab:Tab,yes:boolean){setTabs(old=>yes?[...new Set([...old,tab])]:old.filter(t=>t!==tab))}
  return <main className="cfsettings"><style>{`
    .cfsettings{min-height:100svh;background:#F9F8FC;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;color:#28233C;padding:25px clamp(14px,5vw,72px) 90px}.cfsettings *{box-sizing:border-box}
    .cfsettings__nav,.cfsettings__main{max-width:950px;margin:0 auto}.cfsettings__nav{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:38px}.cfsettings__brand{font-size:25px;letter-spacing:-.08em;font-weight:900;text-decoration:none;color:#28233C}.cfsettings__brand span{color:#7158D7}.cfsettings__back{padding:12px 18px;border:1px solid #E6E0F0;border-radius:100px;color:#655D71;background:#fff;font-weight:800;font-size:12px;text-decoration:none}
    .cfsettings__hero{background:#EAE2FF;border-radius:29px;padding:clamp(28px,4vw,50px);margin-bottom:22px}.cfsettings__hero h1{font-size:clamp(36px,4.8vw,60px);letter-spacing:-.075em;line-height:1.1;margin:10px 0 12px}.cfsettings__eyebrow{font-size:11px;color:#6C53C6;letter-spacing:.12em;font-weight:850}.cfsettings__hero p{color:#6F647F;max-width:620px;font-size:14px;line-height:1.65;margin:0}
    .cfsettings__form{display:grid;gap:17px}.cfsettings__card{border-radius:24px;background:#fff;border:1px solid #EBE6F1;padding:clamp(23px,3.5vw,35px);display:grid;gap:16px}.cfsettings__card h2{font-size:23px;letter-spacing:-.045em;margin:0}.cfsettings__card p{color:#7D768A;font-size:13px;line-height:1.65;margin:0}
    .cfsettings__label{font-size:12px;font-weight:800;color:#5C556C}.cfsettings select{height:50px;border-radius:13px;border:1px solid #E4DEED;padding:0 14px;background:#FAF8FD;font-size:15px}.cfsettings__choice{display:flex;align-items:start;gap:12px;font-size:14px;line-height:1.6;color:#625B70}.cfsettings__choice input{width:18px;height:18px;accent-color:#745BDD;flex:0 0 auto;margin-top:2px}.cfsettings__save{border:0;border-radius:100px;min-height:53px;padding:15px 26px;font-weight:800;background:#28233C;color:#fff;cursor:pointer;font-size:14px}.cfsettings__save:disabled{opacity:.55;cursor:not-allowed}.cfsettings__status{font-size:13px;font-weight:800;color:#6456B5}
  `}</style><nav className="cfsettings__nav"><a className="cfsettings__brand" href="https://lead-gen-site-dc4966.webflow.io/">crew<span>for</span>that.</a><a className="cfsettings__back" href="/dashboard">← Dashboard</a></nav><div className="cfsettings__main"><header className="cfsettings__hero"><span className="cfsettings__eyebrow">CONTRACTOR SETTINGS</span><h1>Your preferences.</h1><p>Control what you want to hear about. Emails will only be sent when the notification service is operational and the listings fit your preferences.</p></header>
  {loading ? <p role="status">Loading preferences…</p> : <form className="cfsettings__form" onSubmit={save}>
  <section className="cfsettings__card"><h2>Opportunity alerts</h2><p>Upcoming email digests are being prepared. These settings will be respected when delivery is enabled.</p><label className="cfsettings__label" htmlFor="cf-frequency">Digest frequency</label><select id="cf-frequency" value={frequency} onChange={e=>setFrequency(e.target.value as Frequency)}><option value="off">Off — no digests</option><option value="weekly">Weekly</option><option value="daily">Daily</option></select></section>
  <section className="cfsettings__card"><h2>What interests you?</h2>{([["jobs_now","Jobs Now"],["upcoming","Future Contracts"],["buyers","Find Buyers"]] as [Tab,string][]).map(([v,label])=><label className="cfsettings__choice" key={v}><input type="checkbox" checked={tabs.includes(v)} onChange={e=>toggle(v,e.target.checked)}/>{label}</label>)}{tabs.length===0&&<p role="alert">Choose at least one area of interest.</p>}</section>
  <section className="cfsettings__card"><h2>Communication</h2><label className="cfsettings__choice"><input type="checkbox" checked={marketing} onChange={e=>setMarketing(e.target.checked)}/>I want optional marketing communications about Crewforthat. This is separate from essential account notices.</label><label className="cfsettings__label" htmlFor="cf-language">Preferred language</label><select id="cf-language" value={language} onChange={e=>setLanguage(e.target.value as "en"|"es")}><option value="en">English</option><option value="es">Spanish (preference saved; translations in development)</option></select></section>
  <button className="cfsettings__save" disabled={saving||tabs.length===0}>{saving?"Saving…":"Save preferences ↗"}</button><a href="/app/privacy" style={{fontSize:13,fontWeight:800,color:"#7057CE",textDecoration:"none"}}>Privacy, data export &amp; deletion requests ↗</a>{message&&<p className="cfsettings__status" role="status">{message}</p>}</form>}</div></main>;
}
