"use client";
import { useState,type FormEvent } from "react";
type Category="account"|"listing"|"billing"|"safety"|"accessibility"|"other";
export default function Support(){
 const [category,setCategory]=useState<Category>("account"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[ticket,setTicket]=useState(""),[error,setError]=useState("");
 async function send(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError("");
  try{const res=await fetch("/api/contractor/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category,message})});
   if(res.status===401){window.location.assign("/login?next=/app/support");return;}
   const j=await res.json().catch(()=>({}));
   if(!res.ok)throw Error("We couldn't submit this request. Try again later.");
   setTicket(j.id);setMessage("");
  }catch(err){setError(err instanceof Error?err.message:"Submission could not be confirmed.");}finally{setBusy(false)}
 }
 return <main className="cfsupport"><style>{`
 .cfsupport{min-height:100svh;background:#FAF9FC;color:#26223A;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;padding:25px clamp(15px,5vw,74px) 85px}.cfsupport *{box-sizing:border-box}
 .cfsupport__nav,.cfsupport__main{max-width:950px;margin:auto}.cfsupport__nav{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:34px}
 .cfsupport__brand{font-size:25px;letter-spacing:-.08em;font-weight:900;text-decoration:none;color:#26223A}.cfsupport__brand span{color:#745ADC}.cfsupport__back{font-size:12px;font-weight:800;text-decoration:none;color:#5D556D;border:1px solid #E8E3F0;background:#fff;border-radius:100px;padding:12px 18px}
 .cfsupport__hero{background:#EAE2FF;border-radius:30px;padding:clamp(30px,5vw,58px);margin-bottom:20px}.cfsupport__tag{font-size:11px;font-weight:850;letter-spacing:.13em;color:#7255C6}
 .cfsupport__hero h1{font-size:clamp(39px,5vw,63px);letter-spacing:-.07em;line-height:1.1;margin:18px 0 13px}
 .cfsupport__hero p{font-size:15px;color:#706780;line-height:1.65;max-width:650px;margin:0}
 .cfsupport__form,.cfsupport__result{border-radius:25px;background:#fff;border:1px solid #EAE5F0;padding:clamp(27px,4vw,43px);display:grid;gap:15px}
 .cfsupport__form label{font-size:11px;font-weight:850;color:#554B67;letter-spacing:.06em}
 .cfsupport__form select,.cfsupport__form textarea{border-radius:14px;background:#FBFAFD;border:1px solid #E5DEEE;font:inherit;font-size:14px;padding:14px;min-height:52px;width:100%}.cfsupport__form textarea{resize:vertical;min-height:155px}
 .cfsupport__form button{border:0;border-radius:100px;background:#27223D;color:#fff;padding:15px 22px;font-size:13px;font-weight:850;cursor:pointer}.cfsupport__form button:disabled{opacity:.6}
 .cfsupport__result{background:#EBF9ED;color:#3F7048;border-color:#CAE9CF;line-height:1.65}.cfsupport__error{color:#984638;font-size:13px}.cfsupport__note{font-size:12px;line-height:1.7;color:#867D90;margin:22px 0}
 `}</style>
 <nav className="cfsupport__nav"><a className="cfsupport__brand" href="https://lead-gen-site-dc4966.webflow.io/">crew<span>for</span>that.</a><a href="/dashboard" className="cfsupport__back">← Dashboard</a></nav>
 <div className="cfsupport__main"><header className="cfsupport__hero"><span className="cfsupport__tag">CONTRACTOR ASSISTANCE</span><h1>How can we help?</h1><p>Flag a billing issue, incorrect listing, account concern, or safety problem. Requests enter an internal review queue; no automated resolution is implied.</p></header>
 {ticket?<div className="cfsupport__result" role="status"><h2>Request received.</h2><p>Your reference is {ticket}. Our operations team can review it in the secured support queue.</p><a href="/dashboard">Return to your dashboard ↗</a></div>:
 <form className="cfsupport__form" onSubmit={send}><label htmlFor="support-category">WHAT'S THIS ABOUT?</label>
 <select id="support-category" value={category} onChange={e=>setCategory(e.target.value as Category)}><option value="account">My account</option><option value="listing">An opportunity listing</option><option value="billing">Billing question</option><option value="safety">Safety or abuse</option><option value="accessibility">Accessibility issue</option><option value="other">Other</option></select>
 <label htmlFor="support-message">TELL US WHAT HAPPENED</label><textarea id="support-message" required minLength={15} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Provide enough detail for review. Do not include payment card numbers or passwords."/>
 <button disabled={busy} type="submit">{busy?"Submitting…":"Submit support request ↗"}</button>{error&&<p className="cfsupport__error" role="alert">{error}</p>}</form>}
 <p className="cfsupport__note">For immediate emergencies, contact the appropriate emergency service. This queue does not provide emergency response or guaranteed response times.</p>
 </div></main>;
}