/**
 * Transactional email. Providers, first configured wins:
 *  1. Resend  (RESEND_API_KEY + ALERT_FROM_EMAIL; needs a verified domain to reach anyone but the account owner)
 *  2. Brevo   (BREVO_API_KEY + ALERT_FROM_EMAIL; a single verified sender address works without owning a domain)
 * No-ops cleanly (returns {skipped:true}) while neither is configured; callers retry via the daily sweep.
 */
export type EmailResult = { sent: true; id?: string } | { sent: false; skipped: true; reason: string } | { sent: false; error: string };
export const emailProvider = (): "resend" | "brevo" | null =>
  !process.env.ALERT_FROM_EMAIL ? null : process.env.RESEND_API_KEY ? "resend" : process.env.BREVO_API_KEY ? "brevo" : null;
export const emailConfigured = () => emailProvider() !== null;
export async function sendEmail(msg: { to: string; subject: string; html: string; idempotencyKey?: string; headers?: Record<string, string> }, fetchImpl: typeof fetch = fetch): Promise<EmailResult> {
  const p = emailProvider();
  if (!p) return { sent: false, skipped: true, reason: "email_not_configured" };
  const from = process.env.ALERT_FROM_EMAIL!;
  if (p === "brevo") {
    const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/); const sender = m ? { name: m[1] || "Crewforthat", email: m[2] } : { name: "Crewforthat", email: from.trim() };
    const r = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", accept: "application/json", ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}) },
      body: JSON.stringify({ sender, to: [{ email: msg.to }], subject: msg.subject, htmlContent: msg.html, ...(msg.idempotencyKey || msg.headers ? { headers: { ...(msg.idempotencyKey ? { "X-Entity-Ref-ID": msg.idempotencyKey } : {}), ...msg.headers } } : {}) }),
    });
    if (!r.ok) return { sent: false, error: `brevo_${r.status}` };
    const j = (await r.json().catch(() => ({}))) as { messageId?: string };
    return { sent: true, id: j.messageId };
  }
  const r = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}) },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, ...(msg.headers ? { headers: msg.headers } : {}) }),
  });
  if (!r.ok) return { sent: false, error: `resend_${r.status}` };
  const j = (await r.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: j.id };
}
