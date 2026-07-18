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

const FeedbackSchema = z.object({
  type: z.enum(["suggestion", "bug", "issue", "other"]),
  title: z.string().trim().min(3, "Add a short title.").max(140),
  message: z.string().trim().min(10, "Add a little more detail.").max(2000),
  page_url: z.string().trim().max(500).optional(),
  browser_info: z.string().trim().max(500).optional()
}).transform((value) => ({
  ...value,
  page_url: value.page_url || null,
  browser_info: value.browser_info || null
}));

const EbayDefaultsSchema = z.object({
  marketplace_id: z.string().trim().min(2).default("EBAY_US"),
  category_id: z.string().trim().min(2).default("183454"),
  merchant_location_key: z.string().trim().optional().transform((value) => value || null),
  payment_policy_id: z.string().trim().optional().transform((value) => value || null),
  return_policy_id: z.string().trim().optional().transform((value) => value || null),
  fulfillment_policy_id: z.string().trim().optional().transform((value) => value || null),
  condition: z.string().trim().min(2).default("USED_EXCELLENT"),
  currency: z.string().trim().min(3).max(3).default("USD"),
  listing_duration: z.string().trim().min(2).default("GTC")
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

export async function submitFeedback(formData: FormData) {
  const { supabase, user } = await requireProfile();
  const parsed = FeedbackSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("feedback_items").insert({
    user_id: user.id,
    ...parsed
  });

  if (error) throw new Error(error.message);

  revalidatePath("/account");
  revalidatePath("/admin");
}

export async function saveEbayDefaults(formData: FormData) {
  const { supabase, user } = await requireProfile();
  const parsed = EbayDefaultsSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("ebay_listing_defaults").upsert({
    user_id: user.id,
    ...parsed,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });

  if (error) throw new Error(error.message);

  revalidatePath("/account");
  revalidatePath("/inventory");
}

export async function disconnectEbay() {
  const { user } = await requireProfile();
  const admin = createAdminClient();
  const { error } = await admin.from("ebay_connections").delete().eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
  revalidatePath("/inventory");
}

export async function switchToFreePlan() {
  const { user, profile } = await requireProfile();

  if (profile?.plan === "admin" || profile?.plan === "founder") {
    throw new Error("This account cannot be downgraded from the account page.");
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
