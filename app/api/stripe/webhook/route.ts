import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return NextResponse.json({ ok: false, error: "Stripe webhook is not configured." }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    const supabase = createAdminClient();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      if (userId) {
        await supabase.from("billing_status").upsert({
          user_id: userId,
          stripe_customer_id: String(session.customer ?? ""),
          stripe_subscription_id: String(session.subscription ?? ""),
          status: "active",
          plan: "pro"
        }, { onConflict: "user_id" });
        await supabase.from("profiles").update({ plan: "pro" }).eq("id", userId).neq("plan", "admin");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid webhook" }, { status: 400 });
  }
}
