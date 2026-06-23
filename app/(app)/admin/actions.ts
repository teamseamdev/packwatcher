"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdmin, requireProfile } from "@/lib/auth";
import { runProductCheck } from "@/lib/stock-checkers/run-check";

const CatalogOfferSchema = z.object({
  name: z.string().min(1),
  tcg: z.string().min(1).default("pokemon"),
  category: z.string().optional(),
  set_name: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
  msrp: z.coerce.number().optional(),
  store_name: z.string().min(1),
  url: z.string().url(),
  last_price: z.coerce.number().optional()
});

export async function adminCheckProduct(productId: string) {
  const { profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");
  await runProductCheck(productId, { enforceRateLimit: false });
  revalidatePath("/admin");
}

export async function promoteAdmin(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");
  const userId = String(formData.get("user_id") ?? "");
  await supabase.from("profiles").update({ plan: "admin" }).eq("id", userId);
  revalidatePath("/admin");
}

export async function addCatalogOffer(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const parsed = CatalogOfferSchema.parse(Object.fromEntries(formData));
  const { data: product, error } = await supabase
    .from("catalog_products")
    .insert({
      name: parsed.name,
      tcg: parsed.tcg,
      category: parsed.category || null,
      set_name: parsed.set_name || null,
      image_url: parsed.image_url || null,
      msrp: parsed.msrp || null
    })
    .select("id")
    .single();

  if (error || !product) {
    throw new Error(error?.message ?? "Could not create catalog product.");
  }

  await supabase.from("catalog_offers").insert({
    catalog_product_id: product.id,
    store_name: parsed.store_name,
    url: parsed.url,
    status: "unknown",
    last_price: parsed.last_price || parsed.msrp || null
  });

  revalidatePath("/admin");
  revalidatePath("/watchlist");
}
