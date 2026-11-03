"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// Magic-link sign-in. Only the anon key is exposed, and RLS protects every table.
export default function Login() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false);
  return sent ? <p>Check your email for a sign-in link.</p> : (
    <form onSubmit={async e => { e.preventDefault(); const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } }); setSent(true); }}>
      <h1>Sign in</h1><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /> <button>Send link</button>
    </form>);
}
