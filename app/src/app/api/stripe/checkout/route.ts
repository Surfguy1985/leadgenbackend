import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { adminDb, currentUser } from "@/lib/supabase";
import { env, missingEnv } from "@/lib/env";
import { loadSettings } from "@/lib/monetization";
import { PAID_PLANS, trialDaysFor } from "@/lib/billing";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
const Body = z.object({ plan: z.enum(PAID_PLANS) });

/** Creates a Stripe Checkout session for the signed-in contractor's org. Price comes from the plans table only. */
export async function POST(req: Request) {
  const nc = missingEnv("STRIPE_SECRET_KEY"); if (nc) return nc;
  if (!rateLimit(`checkout:${clientIp(req)}`, 10, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const u = await currentUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "invalid_plan" }, { status: 422 });
  const db = adminDb();
  const { data: plan } = await db.from("plans").select("code,stripe_price_id,trial_days,purchasable").eq("code", p.data.plan).maybeSingle();
  if (!plan?.purchasable || !plan.stripe_price_id) return NextResponse.json({ error: "plan_unavailable" }, { status: 409 });
  const { data: org } = await db.from("organizations").select("id").eq("owner_user_id", u.user.id).eq("kind", "contractor").maybeSingle();
  if (!org) return NextResponse.json({ error: "onboard_first", next: "/onboarding" }, { status: 409 });
  const { data: subs } = await db.from("subscriptions").select("stripe_customer_id,status,trial_end").eq("organization_id", org.id);
  if ((subs ?? []).some(s => ["active", "trialing", "past_due"].includes(s.status))) return NextResponse.json({ error: "already_subscribed", next: "/api/stripe/portal" }, { status: 409 });
  const hadTrial = (subs ?? []).some(s => s.trial_end);
  const customer = subs?.find(s => s.stripe_customer_id)?.stripe_customer_id ?? undefined;
  const stripe = new Stripe(env.stripeSecret());
  // Founding member: real reserved seat + admin-configured Stripe (test) coupon, applied for the life of the subscription.
  const { data: fm } = await db.from("founding_members").select("organization_id").eq("organization_id", org.id).maybeSingle();
  const coupon = fm ? (await loadSettings(db)).foundingCoupon : null;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription", line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    customer, customer_email: customer ? undefined : u.user.email ?? undefined, client_reference_id: org.id,
    subscription_data: { metadata: { organization_id: org.id, plan_code: plan.code }, trial_period_days: trialDaysFor(plan, hadTrial) },
    metadata: { organization_id: org.id }, ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: false }),
    success_url: `${env.appUrl()}/dashboard?billing=success`, cancel_url: `${env.appUrl()}/dashboard?billing=cancel`,
  }, { idempotencyKey: `checkout:${org.id}:${plan.code}:${new Date().toISOString().slice(0, 13)}` });
  return NextResponse.json({ url: session.url });
}
