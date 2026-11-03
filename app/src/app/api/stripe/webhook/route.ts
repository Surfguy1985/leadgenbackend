import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb, audit } from "@/lib/supabase";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const HANDLED = new Set(["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed"]);

function planFor(priceId: string | undefined) {
  if (priceId === env.priceLocalPro()) return "local_pro";
  if (priceId === env.priceMultiTrade()) return "multi_trade";
  return "free";
}

export async function POST(req: Request) {
  const stripe = new Stripe(env.stripeSecret());
  const sig = req.headers.get("stripe-signature");
  const body = await req.text(); // raw body required for signature verification
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, sig ?? "", env.stripeWebhookSecret()); }
  catch { return NextResponse.json({ error: "invalid_signature" }, { status: 400 }); }

  const db = adminDb();
  // Idempotency: insert event id first; duplicate → already processed
  const { error: dup } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) {
    if (dup.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ error: "db_error" }, { status: 500 }); // Stripe will retry
  }

  try {
    if (!HANDLED.has(event.type)) return NextResponse.json({ received: true, ignored: true });
    const upsertSub = async (sub: Stripe.Subscription) => {
      const orgId = sub.metadata?.organization_id;
      if (!orgId) throw new Error("subscription missing metadata.organization_id");
      const periodEnd = (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end;
      await db.from("subscriptions").upsert({
        organization_id: orgId, stripe_customer_id: String(sub.customer), stripe_subscription_id: sub.id,
        plan: event.type === "customer.subscription.deleted" ? "free" : planFor(sub.items.data[0]?.price.id),
        status: sub.status === "incomplete_expired" ? "canceled" : sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      }, { onConflict: "stripe_subscription_id" });
    };
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) await upsertSub(await stripe.subscriptions.retrieve(String(s.subscription)));
        break;
      }
      case "customer.subscription.created": case "customer.subscription.updated": case "customer.subscription.deleted":
        await upsertSub(event.data.object as Stripe.Subscription); break;
      case "invoice.paid": case "invoice.payment_failed": {
        const inv = event.data.object as unknown as { parent?: { subscription_details?: { subscription?: string } }; subscription?: string };
        const subId = inv.parent?.subscription_details?.subscription ?? inv.subscription;
        if (subId) await upsertSub(await stripe.subscriptions.retrieve(String(subId))); // re-read source of truth
        break;
      }
    }
    await audit("stripe", event.type, "stripe_event", event.id);
    return NextResponse.json({ received: true });
  } catch (e) {
    // roll back idempotency marker so Stripe's retry is processed
    await db.from("stripe_events").delete().eq("id", event.id);
    await db.from("workflow_failures").insert({ workflow: "WF-05", node: event.type, payload: { event_id: event.id }, error: String(e) });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
