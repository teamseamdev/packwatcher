"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile, requireUser } from "@/lib/auth";
import { runProductCheck } from "@/lib/stock-checkers/run-check";

const ProductSchema = z.object({
  name: z.string().min(1),
  store_name: z.string().min(1),
  url: z.string().url(),
  category: z.string().optional(),
  set_name: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
  msrp: z.coerce.number().optional(),
  target_price: z.coerce.number().optional(),
  alerts_enabled: z.coerce.boolean().default(false),
  notes: z.string().optional()
});

export async function addProduct(formData: FormData) {
  const { supabase, user, profile } = await requireProfile();
  const { count } = await supabase.from("tracked_products").select("*", { count: "exact", head: true }).eq("user_id", user.id);

  if (profile?.plan === "free" && (count ?? 0) >= 5) {
    throw new Error("Free plan limit reached.");
  }

  const parsed = ProductSchema.parse(Object.fromEntries(formData));
  await supabase.from("tracked_products").insert({
    ...parsed,
    user_id: user.id,
    status: "unknown",
    msrp: parsed.msrp || null,
    target_price: parsed.target_price || null,
    image_url: parsed.image_url || null
  });
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
