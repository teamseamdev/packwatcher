import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/stock-checkers";
import { assertRateLimit } from "@/lib/stock-checkers/rate-limit";
import type { TrackedProduct } from "@/lib/types";

export async function runProductCheck(productId: string, options: { enforceRateLimit?: boolean } = {}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tracked_products").select("*").eq("id", productId).single();
  const product = data as TrackedProduct | null;
  if (error || !product) throw new Error(error?.message ?? "Product not found");

  if (options.enforceRateLimit !== false) {
    assertRateLimit(product.id);
  }

  const previousStatus = product.status;
  const adapter = getAdapter(product.url, product.store_name);
  const result = await adapter.check({ id: product.id, url: product.url, storeName: product.store_name });

  await supabase.from("stock_checks").insert({
    tracked_product_id: product.id,
    status: result.status,
    price: result.price,
    raw_match_reason: `${adapter.name}: ${result.rawMatchReason}`,
    checked_at: result.checkedAt
  });

  const updates: Partial<TrackedProduct> = {
    status: result.status,
    last_price: result.price,
    last_checked_at: result.checkedAt
  };

  if (!product.image_url && result.imageUrl) {
    updates.image_url = result.imageUrl;
  }

  if ((product.name === product.url || product.name === "Untitled product") && result.title) {
    updates.name = result.title;
  }

  await supabase.from("tracked_products").update(updates).eq("id", product.id);

  if (product.alerts_enabled && previousStatus === "out_of_stock" && result.status === "in_stock") {
    await supabase.from("notifications").insert({
      user_id: product.user_id,
      tracked_product_id: product.id,
      type: "restock",
      title: `${product.name} is in stock`,
      message: `${product.store_name} appears to have ${product.name} in stock. Open the store page to confirm and purchase manually.`
    });

    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: `PackWatcher alert: ${product.name} may be in stock at ${product.store_name}. ${product.url}` })
      }).catch(() => undefined);
    }
  }

  return { productId: product.id, previousStatus, ...result };
}
