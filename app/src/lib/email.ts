/** Resend wrapper. No-ops cleanly (returns {skipped:true}) while RESEND_API_KEY or ALERT_FROM_EMAIL is missing. */
export type EmailResult = { sent: true; id?: string } | { sent: false; skipped: true; reason: string } | { sent: false; error: string };
export const emailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.ALERT_FROM_EMAIL;
export async function sendEmail(msg: { to: string; subject: string; html: string; idempotencyKey?: string }, fetchImpl: typeof fetch = fetch): Promise<EmailResult> {
  if (!emailConfigured()) return { sent: false, skipped: true, reason: "email_not_configured" };
  const r = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}) },
    body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [msg.to], subject: msg.subject, html: msg.html }),
  });
  if (!r.ok) return { sent: false, error: `resend_${r.status}` };
  const j = (await r.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: j.id };
}
