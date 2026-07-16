import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { getRetailerMonitor } from "@/lib/retailers";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { notificationEventKey, shouldSendRestockAlert } from "@/lib/retailers/shared/restock-events";
import type { CatalogOffer, CatalogProduct, ProductAlert } from "@/lib/types";

type OfferRow = CatalogOffer & {
  catalog_products: CatalogProduct | null;
};

export async function checkExistingCatalogOffers(supabase: SupabaseClient, limit = Number(process.env.CATALOG_OFFER_CHECK_LIMIT ?? 100)) {
  const result = { offersChecked: 0, alertsTriggered: 0, errors: [] as string[] };
  const { data: offers, error } = await supabase
    .from("catalog_offers")
    .select("*, catalog_products!catalog_offers_catalog_product_id_fkey(*)")
    .not("url", "is", null)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return { ...result, errors: [error.message] };
  }

  for (const offer of (offers ?? []) as OfferRow[]) {
    if (offer.active === false) continue;
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
          const snapshot = {
            retailerProductId: offer.retailer_product_id ?? offer.id,
            retailer,
            productId,
            status: checked.status,
            previousStatus: previousInStock ? "in_stock" as const : "out_of_stock" as const,
            price: checked.price,
            sellerName: typeof offer.metadata?.sellerName === "string" ? offer.metadata.sellerName : retailer,
            officialRetailerSeller: typeof offer.metadata?.officialRetailerSeller === "boolean" ? offer.metadata.officialRetailerSeller : true,
            availabilityType: "online" as const
          };

          if (!shouldSendRestockAlert(alert, snapshot)) continue;

          const eventKey = notificationEventKey(alert.user_id, snapshot);
          if (await hasRecentNotificationEvent(supabase, alert, productId, retailer, "online")) continue;

          const { error: eventError } = await supabase.from("notification_events").insert({
            user_id: alert.user_id,
            product_id: productId,
            event_key: eventKey,
            status: checked.status,
            price: checked.price,
            retailer,
            availability_type: "online",
            metadata: {
              offerId: offer.id,
              url: offer.url,
              previousInStock,
              checkedAt
            }
          });

          if (eventError?.code === "23505") continue;

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
      await logAppEvent({
        category: "retailer",
        severity: "error",
        message: "Catalog offer check failed",
        metadata: { ...errorMetadata(error), offerId: offer.id, storeName: offer.store_name, url: offer.url }
      });
    }
  }

  return result;
}

async function hasRecentNotificationEvent(
  supabase: SupabaseClient,
  alert: ProductAlert,
  productId: string,
  retailer: string,
  availabilityType: "online" | "local" | "marketplace"
) {
  const cooldownMinutes = alert.cooldown_minutes ?? 60;
  if (cooldownMinutes <= 0) return false;

  const since = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("notification_events")
    .select("id")
    .eq("user_id", alert.user_id)
    .eq("product_id", productId)
    .eq("retailer", retailer)
    .eq("availability_type", availabilityType)
    .gte("sent_at", since)
    .limit(1);

  if (error) return false;
  return Boolean(data?.length);
}
