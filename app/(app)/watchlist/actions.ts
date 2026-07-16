"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile, requireUser } from "@/lib/auth";
import { FREE_TRACKED_PRODUCT_LIMIT } from "@/lib/plans";
import { fetchProductMetadata } from "@/lib/product-metadata";
import { runProductCheck } from "@/lib/stock-checkers/run-check";
import type { CatalogOffer } from "@/lib/types";

const optionalText = z.string().trim().optional().or(z.literal(""));

const ProductSchema = z.object({
  name: optionalText,
  store_name: optionalText,
  url: z.string().url(),
  category: optionalText,
  set_name: optionalText,
  image_url: z.string().url().optional().or(z.literal("")),
  msrp: z.coerce.number().optional(),
  target_price: z.coerce.number().optional(),
  alerts_enabled: z.coerce.boolean().default(false),
  notes: optionalText
});

export async function addProduct(formData: FormData) {
  const { supabase, user, profile } = await requireProfile();
  const { count } = await supabase.from("tracked_products").select("*", { count: "exact", head: true }).eq("user_id", user.id);

  if (profile?.plan === "free" && (count ?? 0) >= FREE_TRACKED_PRODUCT_LIMIT) {
    throw new Error(`Free plan limit reached. Upgrade to track more than ${FREE_TRACKED_PRODUCT_LIMIT} products.`);
  }

  const parsed = ProductSchema.parse(Object.fromEntries(formData));
  const metadata = await fetchProductMetadata(parsed.url).catch(() => null);
  const name = parsed.name || metadata?.title || "Untitled product";
  const storeName = parsed.store_name || metadata?.storeName || new URL(parsed.url).hostname.replace(/^www\./, "");
  const imageUrl = parsed.image_url || metadata?.imageUrl || null;
  const initialPrice = metadata?.price ?? null;

  const { data: product, error } = await supabase.from("tracked_products").insert({
    ...parsed,
    name,
    store_name: storeName,
    user_id: user.id,
    status: "unknown",
    msrp: parsed.msrp || initialPrice,
    target_price: parsed.target_price || null,
    image_url: imageUrl,
    last_price: initialPrice
  }).select("id").single();

  if (error) {
    throw new Error(error.message);
  }

  if (product?.id) {
    await runProductCheck(product.id, { enforceRateLimit: false }).catch(() => undefined);
  }

  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}

export async function trackCatalogOffer(offerId: string) {
  const { supabase, user, profile } = await requireProfile();
  const { count } = await supabase.from("tracked_products").select("*", { count: "exact", head: true }).eq("user_id", user.id);

  if (profile?.plan === "free" && (count ?? 0) >= FREE_TRACKED_PRODUCT_LIMIT) {
    throw new Error(`Free plan limit reached. Upgrade to track more than ${FREE_TRACKED_PRODUCT_LIMIT} products.`);
  }

  const { data, error } = await supabase
    .from("catalog_offers")
    .select("*, catalog_products!catalog_offers_catalog_product_id_fkey(*)")
    .eq("id", offerId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Catalog offer not found.");
  }

  const offer = data as CatalogOffer;
  if (offer.active === false) {
    throw new Error("This retailer offer has been disabled by PackWatcher.");
  }
  const product = offer.catalog_products;
  if (!product) {
    throw new Error("Catalog product not found.");
  }

  await supabase.from("product_alerts").upsert({
    user_id: user.id,
    product_id: product.id,
    notify_push: true
  }, { onConflict: "user_id,product_id" });

  const { data: duplicate } = await supabase
    .from("tracked_products")
    .select("id")
    .eq("user_id", user.id)
    .eq("url", offer.url)
    .maybeSingle();

  if (duplicate) {
    revalidatePath("/watchlist");
    return;
  }

  const { data: tracked, error: insertError } = await supabase
    .from("tracked_products")
    .insert({
      user_id: user.id,
      name: product.name,
      store_name: offer.store_name,
      url: offer.url,
      image_url: product.image_url,
      category: product.category,
      set_name: product.set_name,
      msrp: product.msrp,
      target_price: null,
      status: offer.status,
      last_price: offer.last_price,
      last_checked_at: offer.last_checked_at,
      alerts_enabled: true,
      notes: `Tracked from PackWatcher catalog: ${product.tcg}`
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  if (tracked?.id) {
    await runProductCheck(tracked.id, { enforceRateLimit: false }).catch(() => undefined);
  }

  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
  revalidatePath(`/catalog/${product.id}`);
}

export async function trackCatalogProduct(productId: string) {
  const { supabase, user, profile } = await requireProfile();
  const { data: existing } = await supabase
    .from("product_alerts")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    revalidatePath(`/catalog/${productId}`);
    return;
  }

  const { count } = await supabase
    .from("product_alerts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (profile?.plan === "free" && (count ?? 0) >= FREE_TRACKED_PRODUCT_LIMIT) {
    throw new Error(`Free plan limit reached. Upgrade to track more than ${FREE_TRACKED_PRODUCT_LIMIT} products.`);
  }

  const { data: product } = await supabase.from("catalog_products").select("id").eq("id", productId).single();
  if (!product) throw new Error("Catalog product not found.");

  const { error } = await supabase.from("product_alerts").upsert({
    user_id: user.id,
    product_id: productId,
    notify_push: true
  }, { onConflict: "user_id,product_id" });
  if (error) throw new Error(error.message);

  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
  revalidatePath(`/catalog/${productId}`);
}

export async function untrackCatalogProduct(productId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("product_alerts")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);

  if (error) throw new Error(error.message);

  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
  revalidatePath(`/catalog/${productId}`);
}

export async function checkOwnProduct(productId: string) {
  const { supabase, user } = await requireUser();
  const { data: product } = await supabase.from("tracked_products").select("id").eq("id", productId).eq("user_id", user.id).single();
  if (!product) throw new Error("Product not found.");
  await runProductCheck(productId, { enforceRateLimit: true });
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}

export async function removeTrackedProduct(productId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("tracked_products")
    .delete()
    .eq("id", productId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}

export async function toggleProductAlerts(productId: string, enabled: boolean) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("tracked_products")
    .update({ alerts_enabled: enabled })
    .eq("id", productId)
    .eq("user_id", user.id);
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}
