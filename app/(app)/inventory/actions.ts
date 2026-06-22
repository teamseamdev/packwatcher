"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const ItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  purchase_price: z.coerce.number().min(0),
  purchase_date: z.string().optional(),
  estimated_sale_price: z.coerce.number().min(0),
  fees: z.coerce.number().min(0),
  shipping: z.coerce.number().min(0),
  notes: z.string().optional()
});

export async function addInventoryItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = ItemSchema.parse(Object.fromEntries(formData));
  await supabase.from("inventory_items").insert({ ...parsed, user_id: user.id });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}
