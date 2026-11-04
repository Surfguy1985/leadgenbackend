"use client";
import { useState } from "react";
type RequestType="export"|"delete"|"correct";
const choices:[RequestType,string,string][]=[
 ["export","Request a data copy","Ask our team to verify your identity and prepare an export of your account information."],
 ["correct","Correct my information","Submit a request to review or correct inaccurate data linked to your account."],
 ["delete","Request deletion","Ask for identity verification and a review of deletion and any legally required retention."],
];
export default function PrivacyRequests(){
 const [busy,setBusy]=useState<RequestType|null>(null),[done,setDone]=useState(""),[error,setError]=useState("");
 async function submit(type:RequestType){
  if(busy)return;setBusy(type);setError("");setDone("");
  try{
    const res=await fetch("/api/contractor/privacy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_type:type})});
    if(res.status===401){window.location.assign("/login?next=/app/privacy");return;}
    const json=await res.json().catch(()=>({}));
    if(!res.ok)throw Error("The request could not be submitted. Try again later.");
    setDone("Request received for "+type+". Reference: "+json.id+". This does not mean processing is complete.");
  }catch(e){setError(e instanceof Error?e.message:"Request not confirmed.");}
  finally{setBusy(null);}
 }
 return <main className="cfprivacy">
 <style>{`
 .cfprivacy{background:#F9F8FC;min-height:100svh;color:#28243C;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;padding:25px clamp(16px,5vw,75px) 90px}.cfprivacy *{box-sizing:border-box}
 .cfprivacy__nav,.cfprivacy__main{max-width:1000px;margin:0 auto}.cfprivacy__nav{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:37px}
 .cfprivacy__brand{font-size:25px;font-weight:900;letter-spacing:-.08em;color:#28243C;text-decoration:none}.cfprivacy__brand span{color:#745BDD}
 .cfprivacy__back{background:#fff;border:1px solid #E8E3EF;color:#625A72;text-decoration:none;border-radius:100px;padding:12px 17px;font-size:12px;font-weight:800}
 .cfprivacy__hero{padding:clamp(30px,5vw,57px);border-radius:30px;background:#E9E1FF;margin-bottom:19px}.cfprivacy__eyebrow{font-weight:850;font-size:11px;letter-spacing:.13em;color:#7155CE}
 .cfprivacy__hero h1{font-size:clamp(38px,5vw,64px);letter-spacing:-.072em;line-height:1.1;margin:17px 0 12px}
 .cfprivacy__hero p{color:#6E657F;font-size:15px;line-height:1.65;max-width:650px;margin:0}
 .cfprivacy__grid{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}
 .cfprivacy__card{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:26px;border:1px solid #E9E4F0;border-radius:24px;background:#fff}
 .cfprivacy__card h2{font-size:22px;letter-spacing:-.046em;line-height:1.2;margin:7px 0 0}.cfprivacy__card p{font-size:13px;color:#80778C;line-height:1.65;margin:0 0 20px}
 .cfprivacy__card button{margin-top:auto;border:0;background:#28233E;border-radius:100px;color:white;font-weight:850;padding:14px 20px;font-size:12px;cursor:pointer}
 .cfprivacy__card button:disabled{opacity:.55}
 .cfprivacy__status{background:#E9F8EC;border:1px solid #CDE6D3;color:#356D46;padding:18px;border-radius:17px;font-size:13px;line-height:1.6;margin:20px 0}
 .cfprivacy__error{background:#FFF2ED;border:1px solid #F2D7CC;color:#8D4433;padding:18px;border-radius:17px;margin:20px 0}
 .cfprivacy__note{font-size:12px;color:#8B8493;line-height:1.65;margin-top:25px}
 @media(max-width:850px){.cfprivacy__grid{grid-template-columns:1fr}.cfprivacy__card{min-height:0}}
 `}</style>
 <nav className="cfprivacy__nav"><a href="https://lead-gen-site-dc4966.webflow.io/" className="cfprivacy__brand">crew<span>for</span>that.</a><a className="cfprivacy__back" href="/app/settings">← Settings</a></nav>
 <div className="cfprivacy__main">
 <header className="cfprivacy__hero"><span className="cfprivacy__eyebrow">YOUR DATA / YOUR CHOICES</span><h1>Control your information.</h1><p>Signed-in contractors can request a data copy, correction, or deletion review. Requests are logged for human processing—not executed blindly.</p></header>
 <div className="cfprivacy__grid">{choices.map(([type,title,description])=><section className="cfprivacy__card" key={type}><h2>{title}</h2><p>{description}</p><button type="button" onClick={()=>void submit(type)} disabled={!!busy}>{busy===type?"Submitting…":"Submit request ↗"}</button></section>)}</div>
 {done&&<p className="cfprivacy__status" role="status">{done}</p>}{error&&<p className="cfprivacy__error" role="alert">{error}</p>}
 <p className="cfprivacy__note">Identity-verified requests are subject to applicable law and record-retention obligations. For a homeowner project request, use the secure management link provided with the submission. No private details are displayed here.</p>
 </div></main>;
}
