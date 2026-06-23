import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { getRetailerMonitor } from "@/lib/retailers";
import type { CatalogOffer, CatalogProduct, ProductAlert } from "@/lib/types";

type OfferRow = CatalogOffer & {
  catalog_products: CatalogProduct | null;
};

export async function checkExistingCatalogOffers(supabase: SupabaseClient, limit = Number(process.env.CATALOG_OFFER_CHECK_LIMIT ?? 100)) {
  const result = { offersChecked: 0, alertsTriggered: 0, errors: [] as string[] };
  const { data: offers, error } = await supabase
    .from("catalog_offers")
    .select("*, catalog_products(*)")
    .not("url", "is", null)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return { ...result, errors: [error.message] };
  }

  for (const offer of (offers ?? []) as OfferRow[]) {
    try {
      const previousInStock = offer.in_stock ?? offer.status === "in_stock";
      const retailer = offer.retailer ?? offer.store_name;
      const monitor = getRetailerMonitor(offer.url, retailer);
      const checked = await monitor.checkOffer(offer);
      const nextInStock = checked.inStock;
      const checkedAt = checked.checkedAt;

      await supabase
        .from("catalog_offers")
        .update({
          status: checked.status,
          last_price: checked.price ?? offer.last_price,
          price: checked.price ?? offer.price ?? offer.last_price,
          in_stock: nextInStock,
          availability_text: checked.availabilityText,
          last_checked_at: checkedAt,
          updated_at: checkedAt,
          image_url: checked.imageUrl ?? offer.image_url
        })
        .eq("id", offer.id);

      result.offersChecked += 1;

      const productId = offer.product_id ?? offer.catalog_product_id;
      if (!previousInStock && nextInStock && productId) {
        const { data: alerts } = await supabase
          .from("product_alerts")
          .select("*")
          .eq("product_id", productId);

        for (const alert of (alerts ?? []) as ProductAlert[]) {
          const productName = offer.catalog_products?.title ?? offer.catalog_products?.name ?? offer.title ?? "A tracked Pokemon product";
          const title = `${productName} is in stock`;
          const message = `${retailer} appears to have ${productName} in stock. Open the retailer page to confirm and purchase manually.`;

          await supabase.from("notifications").insert({
            user_id: alert.user_id,
            tracked_product_id: null,
            type: "restock",
            title,
            message
          });

          if (alert.notify_push) {
            await sendPushToUser(alert.user_id, {
              title,
              body: message,
              url: `/catalog/${productId}`
            });
          }

          result.alertsTriggered += 1;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      result.errors.push(error instanceof Error ? `${offer.store_name}: ${error.message}` : `${offer.store_name}: unknown check error`);
    }
  }

  return result;
}
