import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, sendEmail } from "@/lib/email";
import { listingStats, reminderEmail, unsubToken } from "@/lib/monetization";

/** Daily: queue step1 for unclaimed listed orgs with a public business email; step2 7 days after step1. Sends only if email + postal address are configured. Max 50/day. */
export async function runClaimReminders(db: SupabaseClient, appUrl: string, opts: { dryRun?: boolean } = {}) {
  const postal = process.env.BUSINESS_POSTAL_ADDRESS ?? null; const secret = process.env.SHARED_SECRET;
  const { data: orgs } = await db.from("organizations").select("id,public_email").eq("claim_status", "unclaimed").eq("is_directory_listed", true).not("public_email", "is", null).limit(200);
  let queued = 0;
  for (const o of orgs ?? []) {
    const { error } = await db.from("claim_reminders").insert({ organization_id: o.id, email: String(o.public_email).toLowerCase(), step: 1 });
    if (!error) queued++;
  }
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: s1 } = await db.from("claim_reminders").select("organization_id,email").eq("step", 1).eq("status", "sent").lt("sent_at", weekAgo).limit(200);
  for (const r of s1 ?? []) await db.from("claim_reminders").insert({ organization_id: r.organization_id, email: r.email, step: 2 }).then(() => null, () => null);
  if (!emailConfigured() || !postal || !secret || opts.dryRun) return { queued, sent: 0, reason: opts.dryRun ? "dry_run" : !emailConfigured() ? "email_not_configured" : !postal ? "BUSINESS_POSTAL_ADDRESS_missing" : "secret_missing" };
  const { data: due } = await db.from("claim_reminders").select("organization_id,email,step,organizations(id,business_name,city,primary_trade,claim_status)").eq("status", "queued").limit(50);
  let sent = 0;
  for (const r of due ?? []) {
    const o: any = r.organizations;
    const sup = await db.from("email_suppressions").select("email").eq("email", r.email).maybeSingle();
    if (sup.data || !o || o.claim_status !== "unclaimed") { await db.from("claim_reminders").update({ status: "skipped" }).eq("organization_id", r.organization_id).eq("step", r.step); continue; }
    const st = await listingStats(db, { id: o.id, city: o.city, trade: o.primary_trade });
    const unsubUrl = `${appUrl}/api/unsubscribe?e=${encodeURIComponent(r.email)}&t=${unsubToken(r.email, secret)}`;
    const m = reminderEmail({ businessName: o.business_name, claimUrl: `${appUrl}/claim/${o.id}?utm_source=claim_reminder&utm_medium=email&step=${r.step}`, unsubUrl, postal, lines: st.lines, step: r.step })!;
    const ok = await sendEmail({ to: r.email, subject: m.subject, html: m.html, headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }).then(x => x.sent, () => false);
    await db.from("claim_reminders").update({ status: ok ? "sent" : "failed", sent_at: new Date().toISOString() }).eq("organization_id", r.organization_id).eq("step", r.step);
    if (ok) sent++;
  }
  return { queued, sent };
}
