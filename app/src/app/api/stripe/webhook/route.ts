import { NextResponse } from "next/server";
import { onPlanChange } from "@/lib/monetization";
import Stripe from "stripe";
import { adminDb, audit } from "@/lib/supabase";
import { env, missingEnv } from "@/lib/env";
import { isConversion, markConverted } from "@/lib/referrals";
import { normStatus, payloadHash, planForPrice, shouldApply, type PlanRow } from "@/lib/billing";

export const runtime = "nodejs";
const HANDLED = new Set(["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed","charge.refunded"]);

export async function POST(req: Request) {
  const nc = missingEnv("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"); if (nc) return nc;
  const stripe = new Stripe(env.stripeSecret());
  const body = await req.text(); // raw body for signature verification
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", env.stripeWebhookSecret()); }
  catch { return NextResponse.json({ error: "invalid_signature" }, { status: 400 }); }

  const db = adminDb();
  const created = new Date(event.created * 1000).toISOString();
  const { error: dup } = await db.from("stripe_events").insert({ id: event.id, type: event.type, created, payload_hash: payloadHash(body) });
  if (dup) return dup.code === "23505" ? NextResponse.json({ received: true, duplicate: true }) : NextResponse.json({ error: "db_error" }, { status: 500 });

  try {
    if (!HANDLED.has(event.type)) return NextResponse.json({ received: true, ignored: true });
    const { data: plans } = await db.from("plans").select("code,stripe_price_id,trial_days,purchasable");
    const upsertSub = async (sub: Stripe.Subscription, deleted = false) => {
      const orgId = sub.metadata?.organization_id;
      if (!orgId) throw new Error("subscription missing metadata.organization_id");
      const { data: cur } = await db.from("subscriptions").select("last_event_created").eq("stripe_subscription_id", sub.id).maybeSingle();
      if (!shouldApply(cur?.last_event_created, event.created)) return; // stale/out-of-order event
      const item = sub.items.data[0] as unknown as { price?: { id: string }; current_period_end?: number };
      const code = deleted ? "free" : planForPrice((plans ?? []) as PlanRow[], item?.price?.id);
      if (!code) throw new Error(`unknown price ${item?.price?.id}`); // never grant on an unmapped price
      await db.from("stripe_events").update({ subscription_id: sub.id }).eq("id", event.id);
      await db.from("subscriptions").upsert({
        organization_id: orgId, stripe_customer_id: String(sub.customer), stripe_subscription_id: sub.id,
        plan_code: code, status: deleted ? "canceled" : normStatus(sub.status),
        trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
        last_event_created: created,
      }, { onConflict: "stripe_subscription_id" });
      if (!deleted && isConversion(code, normStatus(sub.status))) await markConverted(db, orgId); // referral attribution (idempotent)
      await onPlanChange(db, orgId, code, deleted ? "canceled" : normStatus(sub.status), sub.id); // funnel + real priority slots
    };
    const ledger = async (row: { stripe_object_id: string; kind: string; organization_id: string | null; amount_cents: number; currency: string; occurred_at: string }) => {
      const { error } = await db.from("billing_ledger").insert({ ...row, stripe_event_id: event.id });
      if (error && error.code !== "23505") throw new Error(`ledger: ${error.message}`); // append-only, idempotent on object id
    };
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) await upsertSub(await stripe.subscriptions.retrieve(String(s.subscription)));
        break;
      }
      case "customer.subscription.created": case "customer.subscription.updated":
        await upsertSub(event.data.object as Stripe.Subscription); break;
      case "customer.subscription.deleted":
        await upsertSub(event.data.object as Stripe.Subscription, true); break;
      case "invoice.paid": case "invoice.payment_failed": {
        const inv = event.data.object as unknown as { id: string; amount_paid: number; currency: string; parent?: { subscription_details?: { subscription?: string; metadata?: Record<string, string> } }; subscription?: string };
        const subId = inv.parent?.subscription_details?.subscription ?? inv.subscription;
        let orgId: string | null = null;
        if (subId) { const sub = await stripe.subscriptions.retrieve(String(subId)); orgId = sub.metadata?.organization_id ?? null; await upsertSub(sub); }
        if (event.type === "invoice.paid" && inv.amount_paid > 0) await ledger({ stripe_object_id: inv.id, kind: "invoice", organization_id: orgId, amount_cents: inv.amount_paid, currency: inv.currency, occurred_at: created });
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        await ledger({ stripe_object_id: `refund:${ch.id}:${ch.amount_refunded}`, kind: "refund", organization_id: ch.metadata?.organization_id ?? null, amount_cents: -ch.amount_refunded, currency: ch.currency, occurred_at: created });
        break;
      }
    }
    await audit("stripe", event.type, "stripe_event", event.id);
    return NextResponse.json({ received: true });
  } catch (e) {
    await db.from("stripe_events").delete().eq("id", event.id); // let Stripe retry
    await db.from("workflow_failures").insert({ workflow: "WF-05", node: event.type, payload: { event_id: event.id }, error: String(e).slice(0, 500) });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
