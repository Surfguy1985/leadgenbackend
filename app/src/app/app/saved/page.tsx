"use client";
import { useEffect, useState } from "react";
type Item = { id: string; opportunity_id: string; note: string | null; created_at: string;
  opportunity: { title: string; trade: string; city: string | null; zip: string | null; deadline: string | null; official_apply_url: string | null; source_url: string | null; tab: string } };

export default function SavedPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  async function reload() {
    setLoading(true);
    try {
      const r = await fetch("/api/contractor/saved", { cache: "no-store" });
      if (r.status === 401) { window.location.assign("/login?next=/app/saved"); return; }
      if (!r.ok) throw new Error("Saved opportunities could not be loaded.");
      const j = await r.json(); setItems(j.items ?? []); setMessage("");
    } catch { setMessage("Saved opportunities are temporarily unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  async function remove(id: string) {
    const r = await fetch("/api/contractor/saved?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (!r.ok) { setMessage("Could not remove the saved opportunity."); return; }
    setItems(xs => xs.filter(x => x.id !== id));
  }
  return <main className="cfsaved">
    <style>{`
      .cfsaved{background:#F9F8FC;color:#252139;min-height:100svh;padding:26px clamp(16px,5vw,80px) 90px;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif}
      .cfsaved *{box-sizing:border-box}.cfsaved__nav{max-width:1130px;margin:0 auto 36px;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}
      .cfsaved__brand{font-weight:900;letter-spacing:-.085em;font-size:25px;color:#252139;text-decoration:none}.cfsaved__brand span{color:#7258D8}
      .cfsaved__back{color:#59536E;text-decoration:none;font-size:13px;font-weight:800;border-radius:100px;background:#fff;padding:11px 18px;border:1px solid #E9E5EF}
      .cfsaved__main{max-width:1130px;margin:auto}.cfsaved__hero{padding:clamp(28px,5vw,65px);background:#EAE2FF;border-radius:30px;margin-bottom:25px}
      .cfsaved__tag{font-size:11px;font-weight:850;letter-spacing:.13em;color:#6E53C5}.cfsaved h1{font-size:clamp(38px,5vw,66px);letter-spacing:-.07em;margin:18px 0 10px;line-height:1.1}
      .cfsaved__hero p{color:#736981;font-size:15px;line-height:1.65;max-width:640px;margin:0}
      .cfsaved__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.cfsaved__card{background:#fff;border:1px solid #E9E5F0;border-radius:24px;padding:28px;display:flex;flex-direction:column;gap:14px;min-width:0}
      .cfsaved__chip{font-size:10px;font-weight:850;letter-spacing:.075em;color:#6E54C6;background:#F0ECFF;padding:9px 13px;border-radius:100px;align-self:flex-start}
      .cfsaved__card h2{font-size:24px;letter-spacing:-.045em;line-height:1.25;margin:0;overflow-wrap:anywhere}.cfsaved__meta{font-size:12px;color:#7D7689;line-height:1.65}
      .cfsaved__actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid #F0EDF4;margin-top:auto;padding-top:17px}
      .cfsaved__apply{font-size:12px;font-weight:850;background:#252139;color:#fff;text-decoration:none;padding:13px 19px;border-radius:100px}
      .cfsaved__remove{border:0;background:#F4F1F7;color:#61596C;cursor:pointer;border-radius:100px;font-weight:800;font-size:12px;padding:13px 18px}
      .cfsaved__empty{background:#fff;border:1px dashed #D7CDEF;border-radius:26px;padding:45px;line-height:1.65;color:#6C6480}
      .cfsaved__empty h2{font-size:29px;letter-spacing:-.05em;color:#252139;margin:0 0 9px}.cfsaved__empty a{display:inline-block;margin-top:12px;border-radius:100px;background:#252139;color:#fff;text-decoration:none;font-size:13px;font-weight:800;padding:13px 20px}
      @media(max-width:750px){.cfsaved__grid{grid-template-columns:1fr}.cfsaved__card{padding:24px}.cfsaved__empty{padding:29px}}
    `}</style>
    <nav className="cfsaved__nav"><a href="https://lead-gen-site-dc4966.webflow.io/" className="cfsaved__brand">crew<span>for</span>that.</a><a className="cfsaved__back" href="/dashboard">← Contractor dashboard</a></nav>
    <div className="cfsaved__main"><header className="cfsaved__hero"><span className="cfsaved__tag">YOUR OPPORTUNITY SHORTLIST</span><h1>Saved work.</h1><p>Keep promising public bids in one place. Always confirm deadlines, changes and requirements with the official source.</p></header>
      {message && <p role="alert">{message}</p>}
      {loading ? <p role="status">Loading saved opportunities…</p> : items.length ?
        <div className="cfsaved__grid">{items.map(item => <article className="cfsaved__card" key={item.id}>
          <span className="cfsaved__chip">{item.opportunity.tab === "jobs_now" ? "PUBLIC OPPORTUNITY" : "OFFICIAL NOTICE"}</span>
          <h2>{item.opportunity.title}</h2><div className="cfsaved__meta">{[item.opportunity.trade,item.opportunity.city,item.opportunity.zip].filter(Boolean).join(" · ")} {item.opportunity.deadline ? " · Deadline " + new Date(item.opportunity.deadline).toLocaleDateString("en-US") : " · Confirm deadline with the source"}</div>
          {item.note && <p>{item.note}</p>}
          <div className="cfsaved__actions"><a className="cfsaved__apply" href={item.opportunity.official_apply_url || item.opportunity.source_url || "https://lead-gen-site-dc4966.webflow.io/opportunities"} target="_blank" rel="noopener noreferrer">Official source ↗</a><button className="cfsaved__remove" onClick={()=>void remove(item.id)}>Remove</button></div>
        </article>)}</div> :
        <section className="cfsaved__empty"><h2>Nothing saved yet.</h2><p>Explore public bids and keep a shortlist of the ones worth pursuing.</p><a href="https://lead-gen-site-dc4966.webflow.io/opportunities">Browse open opportunities ↗</a></section>}
    </div>
  </main>;
}
