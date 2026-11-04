"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

function ClaimForm() {
  const q=useSearchParams();
  const [id,setId]=useState(q.get("id")??"");
  // A directory card link with ?id= goes straight to the full claim flow (domain-email code or proof review).
  useEffect(()=>{const v=q.get("id");if(v&&/^[0-9a-fA-F-]{36}$/.test(v))window.location.replace(`/claim/${v}`);},[q]);
  const [note,setNote]=useState("");
  const [website,setWebsite]=useState("");
  const [agree,setAgree]=useState(false);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [message,setMessage]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/contractor/claims",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organization_id:id.trim(),note,website,agree_review:agree})});
      if(response.status===401){window.location.assign("/login?next=/claim-business");return;}
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(json.error==="organization_already_claimed"?"This business is already claimed. Contact support if ownership is disputed.":json.error==="organization_not_available"?"This business could not be found in the reviewed directory.":"We couldn't file this claim. Check the organization ID and try again.");
      setMessage("Your business claim is awaiting independent review. No contact details were changed.");
      setDone(true);
    } catch(err) {setMessage(err instanceof Error?err.message:"Claim not submitted.");}
    finally{setBusy(false)}
  }
  return <section className="cfclaim__card">
    <p className="cfclaim__tag">INDEPENDENT OWNERSHIP REVIEW</p>
    <h2>{done?"Request received.":"Tell us about your business."}</h2>
    {done?<div role="status"><p>{message}</p><a href="/dashboard">Return to your dashboard ↗</a></div>:
    <form className="cfclaim__form" onSubmit={submit}>
      <p>Claiming a directory profile never automatically transfers ownership. A reviewer must independently validate your control of the business before edits or contact details can change.</p>
      <label htmlFor="claim-id">DIRECTORY ORGANIZATION ID</label><input id="claim-id" value={id} onChange={e=>setId(e.target.value)} required placeholder="UUID from the directory listing" pattern="[0-9a-fA-F-]{36}"/>
      <label htmlFor="claim-web">PUBLIC COMPANY WEBSITE (OPTIONAL)</label><input id="claim-web" type="url" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://yourbusiness.com"/>
      <label htmlFor="claim-evidence">HOW CAN WE VERIFY YOU REPRESENT THIS BUSINESS?</label><textarea id="claim-evidence" value={note} onChange={e=>setNote(e.target.value)} minLength={15} maxLength={1200} required rows={5} placeholder="Explain your role and how a reviewer can verify your business affiliation. Do not include passwords or personal documents."/>
      <label className="cfclaim__consent"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} required/>I understand this request requires independent review and does not grant immediate access.</label>
      <button disabled={busy||!agree}>{busy?"Submitting…":"Request review ↗"}</button>
      {message&&<p role="alert">{message}</p>}
    </form>}
  </section>;
}
export default function ClaimBusiness() {return <main className="cfclaim"><style>{`
 .cfclaim{min-height:100svh;background:#FAF9FC;color:#25223D;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;padding:25px 16px 75px}.cfclaim *{box-sizing:border-box}
 .cfclaim__nav,.cfclaim__content{max-width:920px;margin:0 auto}.cfclaim__nav{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:28px}.cfclaim__brand{font-size:25px;font-weight:900;letter-spacing:-.085em;color:#27223C;text-decoration:none}.cfclaim__brand span{color:#7258D8}.cfclaim__back{font-size:12px;font-weight:800;color:#60586F;background:#fff;padding:12px 15px;border:1px solid #E9E5EF;border-radius:100px;text-decoration:none}
 .cfclaim__hero{background:#E9E1FF;border-radius:28px;padding:clamp(30px,5vw,60px);margin-bottom:19px}.cfclaim__hero span,.cfclaim__tag{font-size:11px;letter-spacing:.13em;font-weight:850;color:#6E54BC}.cfclaim__hero h1{font-size:clamp(39px,5vw,66px);letter-spacing:-.07em;line-height:1.12;margin:17px 0 15px}.cfclaim__hero p{font-size:15px;color:#706780;line-height:1.65;max-width:670px}
 .cfclaim__card{border:1px solid #EBE5F1;background:#fff;padding:clamp(27px,4vw,44px);border-radius:26px}.cfclaim__card h2{font-size:clamp(27px,3vw,37px);letter-spacing:-.053em;margin:16px 0}.cfclaim__form{display:grid;gap:14px}.cfclaim__form>p{color:#736B7D;font-size:14px;line-height:1.7}.cfclaim__form>label:not(.cfclaim__consent){font-size:11px;font-weight:850;letter-spacing:.06em;color:#4E4562}.cfclaim__form input:not([type="checkbox"]),.cfclaim__form textarea{border:1px solid #E2DBED;border-radius:14px;padding:14px;font:inherit;background:#FCFAFE;width:100%;min-height:52px}.cfclaim__form textarea{resize:vertical}.cfclaim__consent{display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.55;color:#665B77}.cfclaim__consent input{accent-color:#735AD8;width:17px;height:17px;flex:0 0 auto}.cfclaim__form button{border:0;border-radius:100px;background:#29243F;color:#fff;padding:16px;font-weight:850;font-size:13px;cursor:pointer;margin-top:10px}.cfclaim__form button:disabled{opacity:.65;cursor:not-allowed}
 `}</style><nav className="cfclaim__nav"><a className="cfclaim__brand" href="https://lead-gen-site-dc4966.webflow.io/">crew<span>for</span>that.</a><a className="cfclaim__back" href="https://lead-gen-site-dc4966.webflow.io/find-buyers">← Find Buyers</a></nav>
 <div className="cfclaim__content"><header className="cfclaim__hero"><span>BUSINESS DIRECTORY / CLAIM YOUR PROFILE</span><h1>Make your business yours.</h1><p>Verified ownership protects buyers and contractors. Every claim is reviewed before changes to a directory profile become possible.</p></header><Suspense fallback={<p>Loading claim form…</p>}><ClaimForm/></Suspense></div>
 </main>}
