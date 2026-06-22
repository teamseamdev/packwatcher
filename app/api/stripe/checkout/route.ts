import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireUser } from "@/lib/auth";

export async function POST() {
  const { user } = await requireUser();
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!secret || !price) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured." }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/upgrade?canceled=1`,
    metadata: { user_id: user.id }
  });

  return NextResponse.json({ ok: true, url: session.url });
}
