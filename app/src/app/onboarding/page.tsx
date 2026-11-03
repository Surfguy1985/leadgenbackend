"use client";
import { useState } from "react";
const TRADES = [["landscaping","Landscaping"],["residential_repair","Residential repair"],["cleaning","Cleaning & janitorial"],["multifamily","Multifamily / make-ready"],["commercial_construction","Commercial construction"],["government_procurement","Government bids"],["other","Other"]];
export default function Onboarding() {
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(""); const fd = new FormData(e.currentTarget);
    const body = { business_name: fd.get("business_name"), display_name: fd.get("display_name"), trades: fd.getAll("trades"),
      zip_codes: String(fd.get("zip_codes") ?? "").split(/[\s,]+/).filter(Boolean), statewide: fd.get("statewide") === "on", goal: fd.get("goal"),
      min_job_value: fd.get("min_job_value") ? Number(fd.get("min_job_value")) : undefined, website: fd.get("website") || "", accept_terms: fd.get("accept_terms") === "on" };
    const r = await fetch("/api/contractor/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); setBusy(false);
    if (r.ok) location.href = "/dashboard"; else setMsg(r.status === 401 ? "Please sign in first." : (j.issues?.map((i: { message: string }) => i.message).join(" ") ?? "Something went wrong."));
  }
  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Join Crewforthat</h1>
      <p>Free accounts see public bids across Texas. Paid plans add verified DFW homeowner leads, each shared with at most 5 contractors.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <input name="business_name" required placeholder="Business name" />
        <input name="display_name" required placeholder="Your name" />
        <fieldset><legend>Trades</legend>{TRADES.map(([v, l]) => <label key={v} style={{ display: "block" }}><input type="checkbox" name="trades" value={v} /> {l}</label>)}</fieldset>
        <input name="zip_codes" placeholder="Service ZIPs (comma separated)" />
        <label><input type="checkbox" name="statewide" /> I work statewide (public bids)</label>
        <select name="goal" defaultValue="now"><option value="now">Jobs now</option><option value="future">Upcoming work</option><option value="buyers">Find buyers / vendor lists</option><option value="all">All of the above</option></select>
        <input name="min_job_value" type="number" min={0} placeholder="Minimum job size ($, optional)" />
        <input name="website" type="url" placeholder="Website (optional)" />
        <label><input type="checkbox" name="accept_terms" required /> I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. No leads, awards, or volume are guaranteed.</label>
        <button disabled={busy}>{busy ? "Saving…" : "Create my free account"}</button>
        {msg && <p role="alert">{msg}</p>}
      </form>
    </main>);
}
