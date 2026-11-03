"use client";
import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";

/** Passwordless contractor access. RLS and server-side cookies enforce authorization. */
export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Sign-in is temporarily unavailable. Please try again shortly.");
      const sb = createBrowserClient(url, key);
      const result = await sb.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (result.error) throw new Error("We couldn't send the sign-in link. Check your address and try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="crew-login">
      <style>{`
        .crew-login{min-height:100svh;display:flex;flex-direction:column;background:#FAF9FC;color:#222037;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif}
        .crew-login *{box-sizing:border-box}
        .crew-login__nav{height:82px;padding:0 min(6vw,85px);display:flex;align-items:center;justify-content:space-between;gap:18px}
        .crew-login__logo{text-decoration:none;color:#222037;font-size:25px;letter-spacing:-.085em;font-weight:900}
        .crew-login__logo span{color:#765DE4}
        .crew-login__home{font-size:13px;font-weight:750;text-decoration:none;color:#625D77;padding:12px 16px;border-radius:100px;background:white;border:1px solid #EBE8F2}
        .crew-login__shell{width:min(1050px,calc(100% - 32px));margin:auto;display:grid;grid-template-columns:.94fr 1.06fr;box-shadow:0 28px 100px rgba(40,30,80,.075);border:1px solid #EAE8F0;border-radius:32px;overflow:hidden;background:#fff}
        .crew-login__aside{background:#EAE1FF;padding:clamp(34px,5vw,68px);display:flex;min-height:475px;flex-direction:column;justify-content:space-between;position:relative}
        .crew-login__aside:after{content:"✳";color:rgba(102,79,201,.11);font-size:170px;position:absolute;right:25px;bottom:15px;line-height:1}
        .crew-login__tag{width:fit-content;background:rgba(255,255,255,.62);color:#6E52C4;padding:10px 14px;border-radius:90px;font-size:11px;font-weight:800;letter-spacing:.11em}
        .crew-login__aside h1{font-size:clamp(40px,4vw,57px);letter-spacing:-.075em;line-height:1.11;max-width:450px;margin:50px 0 16px}
        .crew-login__aside h1 em{font-style:normal;color:#6C54D7}
        .crew-login__aside p{max-width:380px;color:#645C7B;line-height:1.65;font-size:15px}
        .crew-login__form{padding:clamp(32px,5vw,75px);display:flex;flex-direction:column;justify-content:center}
        .crew-login__form h2{font-size:30px;line-height:1.2;letter-spacing:-.055em;margin:0 0 10px}
        .crew-login__form p{font-size:15px;color:#7B7789;line-height:1.6;margin:0 0 28px}
        .crew-login__field{display:grid;gap:9px;margin-bottom:17px}
        .crew-login__field label{font-size:12px;letter-spacing:.025em;font-weight:800}
        .crew-login__field input{width:100%;min-height:54px;border-radius:15px;border:1px solid #DDD9E8;background:#FAF9FC;padding:14px 16px;font-size:16px;color:#222037}
        .crew-login__field input:focus{border-color:#775FEB;outline:3px solid #E9E3FF}
        .crew-login__submit{cursor:pointer;min-height:52px;width:100%;border:0;border-radius:100px;background:#26223B;color:#fff;font-size:14px;font-weight:800}
        .crew-login__submit:hover:not(:disabled){background:#7057DB}.crew-login__submit:disabled{opacity:.65;cursor:wait}
        .crew-login__error{background:#FFF1EE;color:#8F3F2B!important;border:1px solid #F6D7CE;padding:14px 16px;border-radius:13px;font-size:13px!important;margin-top:16px!important}
        .crew-login__help{margin:20px 0 0!important;font-size:12px!important;color:#858192!important}
        .crew-login__help a{color:#6250CD}
        .crew-login__sent{padding:25px;background:#F0F9EB;border:1px solid #DBEDD0;border-radius:21px;color:#2E5634}
        .crew-login__sent strong{display:block;font-size:23px;margin:0 0 11px}
        .crew-login__sent p{margin:0 0 15px;color:#42664D}
        .crew-login__retry{border:0;background:transparent;color:#6550C7;font-weight:800;padding:0;cursor:pointer}
        .crew-login__footer{text-align:center;font-size:11px;color:#A19BAB;padding:25px}
        @media(max-width:740px){.crew-login__nav{height:72px;padding:0 24px}.crew-login__shell{grid-template-columns:1fr}.crew-login__aside{min-height:190px;padding:31px}.crew-login__aside h1{font-size:37px;margin:25px 0 10px}.crew-login__aside p{margin:0}.crew-login__aside:after{font-size:110px}.crew-login__form{padding:35px 28px 42px}}
        @media(prefers-reduced-motion:reduce){.crew-login *, .crew-login *:before, .crew-login *:after{transition:none!important;animation:none!important}}
      `}</style>
      <nav className="crew-login__nav">
        <a className="crew-login__logo" href="https://lead-gen-site-dc4966.webflow.io/" aria-label="Crewforthat home">crew<span>for</span>that.</a>
        <a className="crew-login__home" href="https://lead-gen-site-dc4966.webflow.io/opportunities">Explore jobs ↗</a>
      </nav>
      <div className="crew-login__shell">
        <aside className="crew-login__aside">
          <span className="crew-login__tag">CREWFORTHAT / CONTRACTORS</span>
          <div><h1>The next move <em>is yours.</em></h1><p>One account for public jobs, your service areas, and opportunities that fit your crew.</p></div>
        </aside>
        <section className="crew-login__form" aria-labelledby="sign-in-heading">
          <h2 id="sign-in-heading">{sent ? "Check your inbox." : "Welcome back."}</h2>
          <p>{sent ? "We sent a secure sign-in link if the address is eligible. Open it on this device to continue." : "Sign in or create a free contractor account. No password needed."}</p>
          {sent ? <div className="crew-login__sent" role="status"><strong>One click to get started.</strong><p>Check your inbox and spam folder. The link expires for your security.</p><button className="crew-login__retry" onClick={() => {setSent(false);setError("");}}>Use another email →</button></div> :
            <form onSubmit={signIn} noValidate={false}>
              <div className="crew-login__field"><label htmlFor="contractor-email">WORK EMAIL</label><input id="contractor-email" type="email" required autoComplete="email" inputMode="email" placeholder="you@yourcompany.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
              <button className="crew-login__submit" disabled={busy} type="submit">{busy ? "Sending link…" : "Continue with email ↗"}</button>
              {error && <p className="crew-login__error" role="alert">{error}</p>}
            </form>}
          <p className="crew-login__help">By continuing, you agree to Crewforthat's <a href="https://lead-gen-site-dc4966.webflow.io/terms">Terms</a> and <a href="https://lead-gen-site-dc4966.webflow.io/privacy">Privacy Policy</a>.</p>
        </section>
      </div>
      <footer className="crew-login__footer">© 2026 Crewforthat · DFW property services · Jobs are never guaranteed.</footer>
    </main>
  );
}
