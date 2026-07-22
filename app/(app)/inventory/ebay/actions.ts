"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { publishEbayInventoryOffer } from "@/lib/ebay/client";
import { getValidEbayAccessToken } from "@/lib/ebay/connection";
import { ebayListingUrl } from "@/lib/ebay/config";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InventoryItem } from "@/lib/types";

const PublishSchema = z.object({
  inventory_item_id: z.string().uuid(),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(20).max(4000),
  price: z.coerce.number().min(0.01),
  quantity: z.coerce.number().int().min(1),
  marketplace_id: z.string().trim().min(2),
  category_id: z.string().trim().min(2),
  condition: z.string().trim().min(2),
  currency: z.string().trim().min(3).max(3),
  listing_duration: z.string().trim().min(2),
  merchant_location_key: z.string().trim().min(1, "Merchant location key is required."),
  payment_policy_id: z.string().trim().min(1, "Payment policy ID is required."),
  return_policy_id: z.string().trim().min(1, "Return policy ID is required."),
  fulfillment_policy_id: z.string().trim().min(1, "Shipping/fulfillment policy ID is required.")
});

export async function publishInventoryItemToEbay(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = PublishSchema.parse(Object.fromEntries(formData));
  const admin = createAdminClient();

  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", parsed.inventory_item_id)
    .eq("user_id", user.id)
    .single<InventoryItem>();

  if (itemError || !item) throw new Error(itemError?.message ?? "Inventory item was not found.");
  if (!item.image_url) throw new Error("Add an image URL to this inventory card before publishing to eBay.");

  const sku = `PW-${parsed.inventory_item_id.replace(/-/g, "").slice(0, 24)}`;
  const payload = {
    ...parsed,
    sku,
    image_url: item.image_url
  };
  let listingUrl: string | null = null;

  try {
    const accessToken = await getValidEbayAccessToken(admin, user.id);
    const published = await publishEbayInventoryOffer({
      accessToken,
      sku,
      title: parsed.title,
      description: parsed.description,
      imageUrls: [item.image_url],
      quantity: parsed.quantity,
      price: parsed.price,
      currency: parsed.currency,
      categoryId: parsed.category_id,
      condition: parsed.condition,
      marketplaceId: parsed.marketplace_id,
      merchantLocationKey: parsed.merchant_location_key,
      paymentPolicyId: parsed.payment_policy_id,
      returnPolicyId: parsed.return_policy_id,
      fulfillmentPolicyId: parsed.fulfillment_policy_id,
      listingDuration: parsed.listing_duration
    });
    listingUrl = ebayListingUrl(published.listingId);

    await supabase.from("ebay_listings").insert({
      user_id: user.id,
      inventory_item_id: item.id,
      sku,
      offer_id: published.offerId,
      listing_id: published.listingId,
      listing_url: listingUrl,
      status: "published",
      title: parsed.title,
      price: parsed.price,
      quantity: parsed.quantity,
      payload
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "eBay publish failed.";
    await supabase.from("ebay_listings").insert({
      user_id: user.id,
      inventory_item_id: item.id,
      sku,
      status: "failed",
      title: parsed.title,
      price: parsed.price,
      quantity: parsed.quantity,
      payload,
      error_message: message
    });
    await logAppEvent({
      category: "ebay",
      severity: "error",
      message: "eBay listing publish failed",
      userId: user.id,
      metadata: {
        ...errorMetadata(error),
        inventoryItemId: item.id,
        marketplaceId: parsed.marketplace_id,
        categoryId: parsed.category_id
      }
    });
    throw new Error(message);
  }

  redirect(listingUrl);
}
