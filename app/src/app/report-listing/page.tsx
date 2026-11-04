"use client";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
const OPTIONS = [
  ["broken_link","The official link isn't working"],
  ["expired","The notice is closed or expired"],
  ["wrong_category","The trade or category looks wrong"],
  ["duplicate","The listing is a duplicate"],
  ["incorrect_details","Information appears incorrect"],
  ["rights_concern","Attribution, privacy or rights concern"],
] as const;
function ReportForm() {
  const query=useSearchParams(), opportunity_id=query.get("id")??"";
  const [issue,setIssue]=useState<string>("broken_link"),[detail,setDetail]=useState(""),[pending,setPending]=useState(false),[message,setMessage]=useState(""),[success,setSuccess]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(pending)return;setPending(true);setMessage("");
    try{const r=await fetch("/api/public/report-listing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({opportunity_id,issue,detail})});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||"Report could not be submitted.");setMessage("Thanks. Your report is in the review queue.");setSuccess(true);}
    catch(err){setMessage(err instanceof Error?err.message:"Report could not be submitted.");}finally{setPending(false)}
  }
  return <div className="cfreport__main"><header className="cfreport__hero"><span className="cfreport__eyebrow">IMPROVE THE SOURCE QUALITY</span><h1>Report a listing.</h1><p>Your report helps us review broken links, outdated notices and misleading information. We do not share private customer details.</p></header>
  {!/^[0-9a-f-]{36}$/i.test(opportunity_id)?<div className="cfreport__box"><p>No valid listing was selected. Open a public opportunity first, then select Report.</p><a href="/app">Browse available work ↗</a></div>:
  success?<div className="cfreport__box" role="status"><h2>Report received.</h2><p>{message}</p><a href="/app">Back to opportunities ↗</a></div>:
  <form className="cfreport__box" onSubmit={submit}><label htmlFor="cfreport-issue">WHAT SHOULD WE REVIEW?</label><select id="cfreport-issue" value={issue} onChange={e=>setIssue(e.target.value)}>{OPTIONS.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><label htmlFor="cfreport-detail">DETAILS (OPTIONAL)</label><textarea id="cfreport-detail" maxLength={500} value={detail} onChange={e=>setDetail(e.target.value)} rows={5} placeholder="What should our reviewers check?" /><button disabled={pending} type="submit">{pending?"Sending…":"Send to review ↗"}</button>{message&&<p role="alert">{message}</p>}</form>}
  </div>;
}
export default function ReportListing() {return <main className="cfreport"><style>{`
 .cfreport{background:#F9F8FC;min-height:100svh;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;color:#25223A;padding:20px}.cfreport *{box-sizing:border-box}
 .cfreport__nav{max-width:880px;margin:0 auto 35px;display:flex;justify-content:space-between;align-items:center;gap:15px}.cfreport__logo{font-size:24px;letter-spacing:-.075em;color:#25223A;text-decoration:none;font-weight:900}.cfreport__logo span{color:#7057D6}
 .cfreport__back{border:1px solid #E9E3F0;border-radius:100px;padding:11px 15px;background:#fff;text-decoration:none;font-size:12px;font-weight:800;color:#59526B}
 .cfreport__main{max-width:880px;margin:auto}.cfreport__hero{background:#EAE2FF;padding:clamp(28px,5vw,55px);border-radius:28px;margin-bottom:18px}.cfreport__eyebrow{letter-spacing:.13em;font-size:11px;color:#6C54C3;font-weight:850}.cfreport__hero h1{font-size:clamp(36px,5vw,62px);letter-spacing:-.067em;line-height:1.1;margin:18px 0 11px}.cfreport__hero p{font-size:14px;line-height:1.7;color:#716A80;max-width:650px}
 .cfreport__box{display:grid;gap:12px;background:#fff;border:1px solid #EBE6F1;border-radius:24px;padding:clamp(25px,4vw,40px)}.cfreport__box label{font-size:11px;font-weight:850;color:#6C6478}.cfreport__box select,.cfreport__box textarea{font-family:inherit;border:1px solid #E5E0ED;background:#FBFAFD;border-radius:14px;padding:14px;min-height:51px;font-size:14px}
 .cfreport__box textarea{resize:vertical}.cfreport__box button{background:#28243F;color:#fff;border:0;border-radius:100px;padding:15px 20px;font-size:13px;font-weight:850;cursor:pointer;margin-top:8px}.cfreport__box button:disabled{opacity:.65}.cfreport__box a{color:#6750CE;font-size:14px;font-weight:800}
 `}</style><nav className="cfreport__nav"><a className="cfreport__logo" href="https://lead-gen-site-dc4966.webflow.io/">crew<span>for</span>that.</a><a className="cfreport__back" href="/app">← Job board</a></nav><Suspense fallback={<p>Loading report form…</p>}><ReportForm/></Suspense></main>}
