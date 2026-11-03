"use client";
import { useEffect, useState } from "react";

type Status = { status: string; open: boolean; title: string; city: string | null; zip: string; hide_after: string | null; public: boolean; contractors_shared_with: number; max_contractors: number };

export default function Manage() {
  const [token, setToken] = useState(""); const [s, setS] = useState<Status | null>(null); const [msg, setMsg] = useState("Loading…");
  const call = async (action: string, t = token) => {
    const r = await fetch("/api/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, action }) });
    return { ok: r.ok, j: await r.json() };
  };
  const load = async (t: string) => { const { ok, j } = await call("status", t); if (ok) { setS(j); setMsg(""); } else setMsg("This link is invalid or has expired."); };
  useEffect(() => { const t = new URLSearchParams(location.search).get("t") ?? ""; setToken(t); history.replaceState(null, "", "/manage"); if (t) load(t); else setMsg("Missing link token."); }, []);
  const act = async (action: string, confirmText?: string) => { if (confirmText && !confirm(confirmText)) return; const { ok, j } = await call(action); setMsg(ok ? "Done." : j.error ?? "Something went wrong."); await load(token); };
  return (
    <main style={{ maxWidth: 560, margin: "48px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Manage your request</h1>
      {msg && <p role="status">{msg}</p>}
      {s && (<>
        <p><b>{s.title}</b>{s.city ? ` · ${s.city}` : ""} {s.zip}</p>
        <p>Status: <b>{s.status}</b>{s.hide_after && s.open ? ` · auto-closes ${new Date(s.hide_after).toLocaleDateString()} unless you confirm it's still needed` : ""}</p>
        <p>Shared with {s.contractors_shared_with} of up to {s.max_contractors} matched contractors. {s.public ? "A non-identifying summary is on the public job board." : "Not on the public board."}</p>
        {s.open && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => act("reconfirm")}>Still need this</button>
          {s.public && <button onClick={() => act("unlist")}>Remove from public board</button>}
          <button onClick={() => act("close", "Mark this job as done or no longer needed?")}>Close request</button>
          <button onClick={() => act("withdraw", "Withdraw consent? Contractors will lose access to your contact details.")}>Withdraw &amp; revoke contact sharing</button>
        </div>}
      </>)}
    </main>
  );
}
