import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb, currentUser } from "@/lib/supabase";
import { env, missingEnv } from "@/lib/env";

export const runtime = "nodejs";
/** Stripe Billing Portal for the signed-in org owner (cancel, change card, invoices). */
export async function POST() {
  const nc = missingEnv("STRIPE_SECRET_KEY"); if (nc) return nc;
  const u = await currentUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = adminDb();
  const { data: org } = await db.from("organizations").select("id").eq("owner_user_id", u.user.id).eq("kind", "contractor").maybeSingle();
  const { data: sub } = org ? await db.from("subscriptions").select("stripe_customer_id").eq("organization_id", org.id).not("stripe_customer_id", "is", null).limit(1).maybeSingle() : { data: null };
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: "no_billing_account" }, { status: 404 });
  const s = await new Stripe(env.stripeSecret()).billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${env.appUrl()}/dashboard` });
  return NextResponse.json({ url: s.url });
}
