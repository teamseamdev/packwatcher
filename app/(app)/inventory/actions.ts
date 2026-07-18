"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const ItemSchema = z.object({
  name: z.string().min(1),
  card_name: z.string().trim().optional().transform((value) => value || null),
  set_name: z.string().trim().optional().transform((value) => value || null),
  card_number: z.string().trim().optional().transform((value) => value || null),
  variant: z.string().trim().optional().transform((value) => value || null),
  foil: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  language: z.string().trim().optional().transform((value) => value || null),
  quantity: z.coerce.number().int().min(1),
  purchase_price: z.coerce.number().min(0),
  purchase_date: z.string().optional().transform((value) => value || null),
  estimated_sale_price: z.coerce.number().min(0),
  fees: z.coerce.number().min(0),
  shipping: z.coerce.number().min(0),
  notes: z.string().optional().transform((value) => value || null)
});

const InventoryItemIdSchema = z.object({
  id: z.string().uuid()
});

const UpdateItemSchema = ItemSchema.extend({
  id: z.string().uuid(),
  image_url: z.string().trim().url().optional().or(z.literal("")).transform((value) => value || null)
});

export async function addInventoryItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = ItemSchema.parse(Object.fromEntries(formData));
  await supabase.from("inventory_items").insert({ ...parsed, user_id: user.id });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function updateInventoryItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = UpdateItemSchema.parse(Object.fromEntries(formData));
  const { id, ...updates } = parsed;

  const { error } = await supabase
    .from("inventory_items")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function deleteInventoryItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = InventoryItemIdSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", parsed.id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}
