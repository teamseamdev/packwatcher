"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile, requireUser } from "@/lib/auth";
import { FREE_TRACKED_PRODUCT_LIMIT } from "@/lib/plans";
import { fetchProductMetadata } from "@/lib/product-metadata";
import { runProductCheck } from "@/lib/stock-checkers/run-check";

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

export async function checkOwnProduct(productId: string) {
  const { supabase, user } = await requireUser();
  const { data: product } = await supabase.from("tracked_products").select("id").eq("id", productId).eq("user_id", user.id).single();
  if (!product) throw new Error("Product not found.");
  await runProductCheck(productId, { enforceRateLimit: true });
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
