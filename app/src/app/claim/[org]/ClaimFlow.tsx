"use client";
import { useState, type FormEvent } from "react";

type Step = "choose" | "code" | "review_sent" | "approved";
export default function ClaimFlow({ orgId, domain, claimed, signedInAs }: { orgId: string; domain: string | null; claimed: boolean; signedInAs: string }) {
  const [method, setMethod] = useState<"domain_email" | "document_review">(domain && !claimed ? "domain_email" : "document_review");
  const [step, setStep] = useState<Step>("choose"); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [note, setNote] = useState(""); const [agree, setAgree] = useState(false);
  const [file, setFile] = useState<File | null>(null); const [claimId, setClaimId] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const E: Record<string, string> = {
    email_not_on_business_domain: `Use an email address at ${domain ?? "the business's website domain"} (not Gmail, Yahoo, etc.).`,
    too_many_codes_today: "You've requested 3 codes today. Try again tomorrow or use document review.",
    email_unavailable: "We couldn't send email right now. Use document review instead.",
    wrong_code: "That code doesn't match.", expired: "That code expired. Send a new one.", too_many_attempts: "Too many wrong codes. Send a new code.",
    statement_required: "Tell us your role and how we can verify it (at least 15 characters).", organization_already_claimed: "This business is already claimed.",
    rate_limited: "Too many requests. Wait a minute and try again.", already_owned: "Someone else already owns this profile. File a dispute instead.",
  };
  async function call(url: string, body: unknown) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) { window.location.assign(`/login?next=${encodeURIComponent(`/claim/${orgId}`)}`); throw new Error(""); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(E[j.error] ?? "Something went wrong. Please try again."); return j;
  }
  async function start(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setErr(""); setMsg("");
    try {
      const j = await call("/api/contractor/claims", { organization_id: orgId, method: claimed ? "document_review" : method, claim_email: method === "domain_email" ? email : undefined, note, agree_review: true });
      setClaimId(j.id);
      if (j.status === "approved") window.location.assign("/onboarding?claimed=1");
      else if (j.status === "challenge_sent") { setStep("code"); setMsg(`We emailed a 6-digit code to ${email}. It expires in 15 minutes.`); }
      else {
        if (file && j.id) { const fd = new FormData(); fd.set("file", file); fd.set("claim_id", j.id); const u = await fetch("/api/contractor/claims/proof", { method: "POST", body: fd }); if (!u.ok) setErr("Your request was filed, but the file didn't upload. You can email it to support."); }
        setStep("review_sent");
      }
    } catch (x) { if (x instanceof Error && x.message) setErr(x.message); } finally { setBusy(false); }
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try { await call("/api/contractor/claims/verify", { claim_id: claimId, code }); setStep("approved"); }
    catch (x) { if (x instanceof Error && x.message) setErr(x.message); } finally { setBusy(false); }
  }
  if (step === "approved") return <section className="cfclaim__card" role="status"><p className="cfclaim__tag">VERIFIED</p><h2>You own this profile now.</h2>
    <p>Your business is on the Free plan: public bids, a claimed profile and alerts. Finish your trades and service area to start getting matches.</p>
    <a className="cfclaim__btn" href="/onboarding?claimed=1" style={{ display: "inline-block", textDecoration: "none" }}>Finish your profile →</a>
    <div className="cfclaim__upsell"><b>Want private DFW leads and faster alerts?</b><p>Try Pro Match free for 3 days ($79.99/mo after; cancel anytime).</p><a href="/dashboard">See plans →</a></div></section>;
  if (step === "review_sent") return <section className="cfclaim__card" role="status"><p className="cfclaim__tag">{claimed ? "DISPUTE FILED" : "IN REVIEW"}</p><h2>{claimed ? "We'll review your dispute." : "Request received."}</h2>
    <p>A reviewer will check your proof, usually within 2 business days. Nothing on the profile changes until then. We'll email {signedInAs}.</p><a href="/dashboard">Back to your dashboard →</a></section>;
  if (step === "code") return <section className="cfclaim__card"><p className="cfclaim__tag">STEP 2 OF 2</p><h2>Enter your code</h2>
    <form className="cfclaim__form" onSubmit={verify}>{msg && <p className="cfclaim__msg">{msg}</p>}
      <label htmlFor="cc">6-DIGIT CODE</label><input id="cc" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
      <button className="cfclaim__btn" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify and claim"}</button>
      <button type="button" className="cfclaim__btn" style={{ background: "#fff", color: "#29243F", border: "1px solid #E2DBED" }} onClick={() => { setStep("choose"); setCode(""); setErr(""); }}>Send a new code</button>
      {err && <p className="cfclaim__msg cfclaim__err" role="alert">{err}</p>}</form></section>;
  return <section className="cfclaim__card"><p className="cfclaim__tag">{claimed ? "THIS PROFILE IS ALREADY CLAIMED" : "STEP 1 OF 2 · VERIFY YOU REPRESENT THIS BUSINESS"}</p>
    <h2>{claimed ? "Think this is your business? File a dispute." : "How would you like to verify?"}</h2>
    {!claimed && <div className="cfclaim__tabs" role="group" aria-label="Verification method">
      <button type="button" aria-pressed={method === "domain_email"} disabled={!domain} onClick={() => setMethod("domain_email")}>Email at {domain ?? "business domain"} · instant</button>
      <button type="button" aria-pressed={method === "document_review"} onClick={() => setMethod("document_review")}>Upload proof · reviewed by a person</button></div>}
    {!domain && !claimed && <p>This listing has no website on file, so verification is by document review.</p>}
    <form className="cfclaim__form" onSubmit={start}>
      {method === "domain_email" && !claimed ? <>
        <label htmlFor="ce">WORK EMAIL AT {domain?.toUpperCase()}</label><input id="ce" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={`you@${domain}`} />
      </> : <>
        <label htmlFor="cn">YOUR ROLE AND HOW WE CAN VERIFY IT</label><textarea id="cn" rows={4} minLength={15} maxLength={1200} required value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. I'm the owner; my name is on the TDLR license / state filing." />
        <label htmlFor="cf">PROOF (PDF, PNG OR JPG, UP TO 5 MB)</label><input id="cf" type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <p style={{ fontSize: 12, margin: 0 }}>Good proof: a business license, state filing, utility bill or letterhead showing the business name. Don't upload IDs with your SSN.</p>
      </>}
      <label className="cfclaim__consent"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} required />I'm authorized to act for this business. False claims are removed and logged.</label>
      <button className="cfclaim__btn" disabled={busy || !agree}>{busy ? "Working…" : method === "domain_email" && !claimed ? "Email me a code" : claimed ? "File dispute" : "Submit for review"}</button>
      {err && <p className="cfclaim__msg cfclaim__err" role="alert">{err}</p>}</form></section>;
}
