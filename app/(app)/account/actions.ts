"use server";

import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PostalCodeSchema = z.object({
  postal_code: z.string().trim().optional()
}).transform((value) => {
  const postalCode = value.postal_code ?? "";
  if (!postalCode) return { postal_code: null };
  if (!/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
    throw new Error("Enter a valid ZIP code.");
  }
  return { postal_code: postalCode };
});

export async function updatePostalCode(formData: FormData) {
  const { user } = await requireProfile();
  const parsed = PostalCodeSchema.parse(Object.fromEntries(formData));
  const admin = createAdminClient();

  await admin.from("profiles").update(parsed).eq("id", user.id);

  revalidatePath("/account");
  revalidatePath("/dashboard");
  revalidatePath("/watchlist");
  revalidatePath("/catalog");
}

export async function switchToFreePlan() {
  const { user, profile } = await requireProfile();

  if (profile?.plan === "admin") {
    throw new Error("Admin accounts cannot be downgraded from the account page.");
  }

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("billing_status")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const subscriptionId = typeof billing?.stripe_subscription_id === "string" ? billing.stripe_subscription_id : "";
  const secret = process.env.STRIPE_SECRET_KEY;

  if (secret && subscriptionId) {
    const stripe = new Stripe(secret);
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  }

  await admin.from("billing_status").upsert({
    user_id: user.id,
    plan: "free",
    status: subscriptionId ? "canceling" : "inactive"
  }, { onConflict: "user_id" });

  await admin.from("profiles").update({ plan: "free" }).eq("id", user.id);

  revalidatePath("/account");
  revalidatePath("/billing");
  revalidatePath("/dashboard");
  revalidatePath("/watchlist");
}
