import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireUser } from "@/lib/auth";
import { normalizePromoCode, promoHasRemainingUses, type PromoCodeRecord } from "@/lib/promo-codes";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!secret || !price) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured." }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  const body = await request.json().catch(() => ({})) as { promo_code?: string };
  const code = normalizePromoCode(body.promo_code);
  let promo: PromoCodeRecord | null = null;
  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;

  if (code) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("promo_codes")
      .select("id,code,discount_type,discount_value,max_uses,used_count,active")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    promo = data as PromoCodeRecord | null;
    if (!promo || !promo.active || !promoHasRemainingUses(promo)) {
      return NextResponse.json({ ok: false, error: "Promo code is invalid or no longer available." }, { status: 400 });
    }

    const coupon = await stripe.coupons.create({
      name: `PackWatcher ${promo.code}`,
      duration: "forever",
      ...(promo.discount_type === "percent"
        ? { percent_off: Number(promo.discount_value) }
        : { amount_off: Math.round(Number(promo.discount_value) * 100), currency: "usd" }),
      metadata: {
        promo_code_id: promo.id,
        promo_code: promo.code
      }
    });

    discounts = [{ coupon: coupon.id }];
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price, quantity: 1 }],
    discounts,
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/account?canceled=1`,
    metadata: {
      user_id: user.id,
      promo_code_id: promo?.id ?? "",
      promo_code: promo?.code ?? ""
    }
  });

  return NextResponse.json({ ok: true, url: session.url });
}
