"use client";

import { useState, type FormEvent } from "react";

const TRADES = [
  ["landscaping", "Landscaping"],
  ["residential_repair", "Repairs"],
  ["cleaning", "Cleaning"],
  ["multifamily", "Make-ready"],
  ["commercial_construction", "Construction"],
  ["government_procurement", "Government bids"],
  ["other", "Other services"],
] as const;

type Step = 1 | 2 | 3;

/**
 * Production onboarding for the free public-opportunities product.
 * Private matched leads / billing are deliberately not advertised as live.
 */
export default function Onboarding() {
  const [step, setStep] = useState<Step>(1);
  const [businessName, setBusinessName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [trades, setTrades] = useState<string[]>([]);
  const [zips, setZips] = useState("");
  const [statewide, setStatewide] = useState(false);
  const [goal, setGoal] = useState("now");
  const [website, setWebsite] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function next(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    if (step === 1 && (!businessName.trim() || !displayName.trim())) {
      setMessage("Add your business name and your name to continue.");
      return;
    }
    if (step === 2) {
      if (!trades.length) { setMessage("Choose at least one service."); return; }
      const zipList = zips.split(/[\s,]+/).filter(Boolean);
      if (!statewide && (!zipList.length || zipList.some(z => !/^\d{5}$/.test(z)))) {
        setMessage("Enter at least one valid five-digit service ZIP, or choose statewide.");
        return;
      }
      if (zipList.length > 50 || zipList.some(z => !/^\d{5}$/.test(z))) {
        setMessage("Enter up to 50 valid five-digit ZIP codes."); return;
      }
    }
    setStep((step + 1) as Step);
  }

  async function finish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setMessage("");
    if (!acceptTerms) { setMessage("Please read and accept the Terms and Privacy Policy."); return; }
    setBusy(true);
    const payload = {
      business_name: businessName.trim(),
      display_name: displayName.trim(),
      trades,
      zip_codes: [...new Set(zips.split(/[\s,]+/).filter(Boolean))],
      statewide,
      goal,
      website: website.trim(),
      accept_terms: acceptTerms,
    };
    try {
      const response = await fetch("/api/contractor/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json.ok) { window.location.assign("/dashboard"); return; }
      if (response.status === 401) {
        setMessage("Your sign-in has expired. Return to sign-in to continue.");
      } else {
        const issues = json.issues?.map((i: { message: string }) => i.message).join(" ");
        setMessage(issues || "We couldn't save your profile. Your information is still here—please try again.");
      }
    } catch {
      setMessage("Network unavailable. Your profile was not confirmed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="cf-onboarding">
      <style>{`
        .cf-onboarding{min-height:100svh;background:#FAF9FC;color:#29243E;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif}
        .cf-onboarding *{box-sizing:border-box}
        .cf-onboarding__nav{height:82px;display:flex;justify-content:space-between;align-items:center;gap:15px;max-width:1170px;padding:0 24px;margin:auto}
        .cf-onboarding__brand{font-weight:900;letter-spacing:-.07em;color:#26213B;font-size:25px;text-decoration:none}.cf-onboarding__brand span{color:#745BDD}
        .cf-onboarding__exit{color:#5F5875;text-decoration:none;background:#fff;border:1px solid #EAE7F0;border-radius:100px;padding:11px 17px;font-size:12px;font-weight:800}
        .cf-onboarding__layout{width:min(1170px,calc(100% - 36px));margin:23px auto 60px;display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);min-height:640px;background:#fff;border:1px solid #EAE6F0;border-radius:34px;overflow:hidden;box-shadow:0 22px 70px rgba(39,25,82,.055)}
        .cf-onboarding__aside{background:#EAE2FF;padding:clamp(28px,5vw,57px);display:flex;flex-direction:column;justify-content:space-between;gap:60px}
        .cf-onboarding__kicker{display:inline-block;border-radius:100px;padding:9px 12px;background:rgba(255,255,255,.75);color:#6C52C6;font-size:11px;letter-spacing:.09em;font-weight:850}
        .cf-onboarding__aside h1{font-size:clamp(38px,4.1vw,58px);letter-spacing:-.075em;line-height:1.09;margin:25px 0 18px;max-width:400px}
        .cf-onboarding__aside h1 em{font-style:normal;color:#6D54D3}
        .cf-onboarding__aside p{font-size:15px;line-height:1.7;color:#666079;max-width:390px;margin:0}
        .cf-onboarding__promise{padding-top:20px;border-top:1px solid rgba(101,72,179,.19);font-weight:750!important;font-size:13px!important}
        .cf-onboarding__main{padding:clamp(27px,5vw,61px);min-width:0}
        .cf-onboarding__progress{display:flex;align-items:center;gap:8px;margin-bottom:42px}
        .cf-onboarding__bar{height:6px;flex:1;border-radius:100px;background:#EFEAF5}
        .cf-onboarding__bar[data-active="true"]{background:#735ADD}
        .cf-onboarding__counter{font-size:11px;letter-spacing:.06em;font-weight:800;color:#736C82;margin-left:14px}
        .cf-onboarding h2{font-size:clamp(28px,3.3vw,38px);line-height:1.15;letter-spacing:-.06em;margin:0 0 10px;font-weight:850}
        .cf-onboarding__description{font-size:14px;line-height:1.7;color:#777184;margin:0 0 30px}
        .cf-onboarding__form{display:grid;gap:19px}
        .cf-onboarding__field{display:grid;gap:8px}
        .cf-onboarding__field>label,.cf-onboarding__legend{font-size:11px;font-weight:800;letter-spacing:.04em;color:#4A425E}
        .cf-onboarding__field input,.cf-onboarding__field select{font-family:inherit;background:#FBFAFD;border:1px solid #E4DFEB;border-radius:15px;min-height:53px;font-size:15px;color:#2A253F;width:100%;padding:13px 15px}
        .cf-onboarding__field input:focus,.cf-onboarding__field select:focus{outline:3px solid #E4DCFF;border-color:#7A5DE7}
        .cf-onboarding__hint{color:#8C8596;font-size:12px;line-height:1.5}
        .cf-onboarding__services{border:0;padding:0;margin:0}
        .cf-onboarding__service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}
        .cf-onboarding__service{display:flex;gap:10px;align-items:center;border:1px solid #E6E1EE;border-radius:15px;padding:15px 13px;font-size:13px;font-weight:750;color:#5E5771;cursor:pointer}
        .cf-onboarding__service:has(input:checked){background:#F0ECFF;border-color:#876CE2;color:#5C43C0}
        .cf-onboarding__service input,.cf-onboarding__checkbox input{accent-color:#7055D5;width:17px;height:17px;flex:0 0 auto}
        .cf-onboarding__checkbox{display:flex;align-items:flex-start;gap:11px;font-size:13px;line-height:1.65;color:#625B74}
        .cf-onboarding__checkbox a{color:#614BBE;font-weight:800}
        .cf-onboarding__buttons{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:22px}
        .cf-onboarding__primary{border:0;border-radius:100px;background:#29243F;color:white;padding:16px 27px;font-size:14px;font-weight:850;min-height:53px;cursor:pointer}
        .cf-onboarding__primary:disabled{opacity:.62;cursor:wait}
        .cf-onboarding__primary:hover:not(:disabled){background:#6F55D8}
        .cf-onboarding__back{background:transparent;color:#635B76;border:0;font-size:13px;font-weight:750;cursor:pointer;padding:12px}
        .cf-onboarding__error{padding:14px 17px;border-radius:14px;background:#FFF0EC;color:#904839;border:1px solid #F2D7CA;font-size:13px;line-height:1.55;margin:19px 0 0}
        .cf-onboarding__summary{background:#F6F3FF;border:1px solid #E8DEFF;border-radius:19px;padding:22px;display:grid;gap:10px}
        .cf-onboarding__summary strong{font-size:15px}.cf-onboarding__summary span{font-size:13px;line-height:1.6;color:#6E6680}
        @media(max-width:800px){.cf-onboarding__layout{grid-template-columns:1fr;margin-top:8px}.cf-onboarding__aside{gap:15px;padding:32px}.cf-onboarding__aside h1{font-size:39px;margin:17px 0 13px}.cf-onboarding__promise{display:none}.cf-onboarding__main{padding:30px}.cf-onboarding__progress{margin-bottom:30px}}
        @media(max-width:480px){.cf-onboarding__layout{width:calc(100% - 18px);border-radius:23px}.cf-onboarding__nav{padding:0 17px;height:68px}.cf-onboarding__main{padding:25px 19px}.cf-onboarding__service-grid{grid-template-columns:1fr}.cf-onboarding__buttons{flex-wrap:wrap}.cf-onboarding__primary{width:100%}.cf-onboarding__back{order:2;width:100%}}
        @media(prefers-reduced-motion:reduce){.cf-onboarding *{transition:none!important}}
      `}</style>
      <header className="cf-onboarding__nav">
        <a href="https://lead-gen-site-dc4966.webflow.io/" className="cf-onboarding__brand">crew<span>for</span>that.</a>
        <a className="cf-onboarding__exit" href="https://lead-gen-site-dc4966.webflow.io/opportunities">Browse jobs ↗</a>
      </header>
      <div className="cf-onboarding__layout">
        <aside className="cf-onboarding__aside">
          <div><span className="cf-onboarding__kicker">CONTRACTOR SETUP / FREE</span>
            <h1>Better work starts <em>with your crew.</em></h1>
            <p>Set up your profile in three short steps. Browse verified public bidding opportunities and apply directly with the issuing organization.</p>
          </div>
          <p className="cf-onboarding__promise">Free public bid discovery today. Private DFW project matching is not available yet.</p>
        </aside>
        <section className="cf-onboarding__main" aria-labelledby="cf-onboarding-heading">
          <div className="cf-onboarding__progress" aria-label={`Step ${step} of 3`}>
            {[1,2,3].map(n => <div key={n} className="cf-onboarding__bar" data-active={step >= n} />)}
            <span className="cf-onboarding__counter">{step} / 3</span>
          </div>
          {step === 1 && <form className="cf-onboarding__form" onSubmit={next}>
            <div><h2 id="cf-onboarding-heading">Meet your company.</h2><p className="cf-onboarding__description">This helps make your profile recognizable.</p></div>
            <div className="cf-onboarding__field"><label htmlFor="cf-business">BUSINESS NAME</label><input id="cf-business" autoComplete="organization" value={businessName} onChange={e=>setBusinessName(e.target.value)} required minLength={2} maxLength={160} placeholder="Your business or crew name" /></div>
            <div className="cf-onboarding__field"><label htmlFor="cf-display">YOUR NAME</label><input id="cf-display" autoComplete="name" value={displayName} onChange={e=>setDisplayName(e.target.value)} required maxLength={120} placeholder="Your name" /></div>
            <div className="cf-onboarding__field"><label htmlFor="cf-site">WEBSITE (OPTIONAL)</label><input id="cf-site" type="url" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://yourcompany.com" /></div>
            <div className="cf-onboarding__buttons"><span className="cf-onboarding__hint">Takes about two minutes.</span><button className="cf-onboarding__primary" type="submit">Next: Your services ↗</button></div>
          </form>}
          {step === 2 && <form className="cf-onboarding__form" onSubmit={next}>
            <div><h2 id="cf-onboarding-heading">What does your crew do?</h2><p className="cf-onboarding__description">Select your services and where you operate.</p></div>
            <fieldset className="cf-onboarding__services"><legend className="cf-onboarding__legend">YOUR TRADES</legend>
              <div className="cf-onboarding__service-grid">{TRADES.map(([id,label])=><label className="cf-onboarding__service" key={id}><input type="checkbox" checked={trades.includes(id)} onChange={e=>setTrades(old=>e.target.checked?[...old,id]:old.filter(v=>v!==id))}/><span>{label}</span></label>)}</div>
            </fieldset>
            <div className="cf-onboarding__field"><label htmlFor="cf-zips">SERVICE ZIP CODES</label><input id="cf-zips" value={zips} onChange={e=>setZips(e.target.value)} placeholder="75034, 75078, 75024" /><span className="cf-onboarding__hint">Separate ZIP codes with commas. Up to 50 locations.</span></div>
            <label className="cf-onboarding__checkbox"><input checked={statewide} onChange={e=>setStatewide(e.target.checked)} type="checkbox" /><span>Show me statewide public bidding opportunities.</span></label>
            <div className="cf-onboarding__buttons"><button className="cf-onboarding__back" type="button" onClick={()=>{setMessage("");setStep(1)}}>← Back</button><button className="cf-onboarding__primary" type="submit">Next: Confirm ↗</button></div>
          </form>}
          {step === 3 && <form className="cf-onboarding__form" onSubmit={finish}>
            <div><h2 id="cf-onboarding-heading">Your next move.</h2><p className="cf-onboarding__description">Choose what you want to explore, then confirm your free profile.</p></div>
            <div className="cf-onboarding__field"><label htmlFor="cf-goal">WHAT ARE YOU LOOKING FOR?</label>
              <select id="cf-goal" value={goal} onChange={e=>setGoal(e.target.value)}><option value="now">Open bids to apply for</option><option value="future">Upcoming opportunities</option><option value="buyers">Government buyers and vendor lists</option><option value="all">All opportunities</option></select>
            </div>
            <div className="cf-onboarding__summary"><strong>{businessName.trim()}</strong><span>{trades.length} trade{trades.length===1?"":"s"} · {statewide?"Statewide public opportunities":zips.split(/[\s,]+/).filter(Boolean).length+" service ZIPs"}</span><span>Free access to public job discovery. No job awards or contractor leads guaranteed.</span></div>
            <label className="cf-onboarding__checkbox"><input type="checkbox" checked={acceptTerms} onChange={e=>setAcceptTerms(e.target.checked)} required /><span>I have read and agree to the <a href="https://lead-gen-site-dc4966.webflow.io/terms" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="https://lead-gen-site-dc4966.webflow.io/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span></label>
            <div className="cf-onboarding__buttons"><button className="cf-onboarding__back" type="button" disabled={busy} onClick={()=>{setMessage("");setStep(2)}}>← Back</button><button className="cf-onboarding__primary" type="submit" disabled={busy||!acceptTerms}>{busy?"Creating your account…":"Create free account ↗"}</button></div>
          </form>}
          {message && <p className="cf-onboarding__error" role="alert">{message}</p>}
        </section>
      </div>
    </main>
  );
}
