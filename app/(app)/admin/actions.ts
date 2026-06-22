"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, requireProfile } from "@/lib/auth";
import { runProductCheck } from "@/lib/stock-checkers/run-check";

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
