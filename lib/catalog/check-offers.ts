import type { SupabaseClient } from "@supabase/supabase-js";
import { getRetailerMonitor } from "@/lib/retailers";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { recordCatalogOfferObservation } from "@/lib/tracker/pipeline";
import type { CatalogOffer, CatalogProduct } from "@/lib/types";

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

      const pipeline = await recordCatalogOfferObservation({
        supabase,
        offer,
        observation: {
          status: checked.status,
          price: checked.price,
          currency: offer.currency ?? "USD",
          availabilityType: "online",
          shippingAvailable: nextInStock ? true : null,
          pickupAvailable: null,
          deliveryAvailable: null,
          sellerName: typeof offer.metadata?.sellerName === "string" ? offer.metadata.sellerName : retailer,
          officialRetailerSeller: typeof offer.metadata?.officialRetailerSeller === "boolean" ? offer.metadata.officialRetailerSeller : true,
          confidence: nextInStock ? 0.78 : 0.7,
          sourceStatus: checked.availabilityText,
          extractionStrategy: "catalog_offer_monitor",
          adapterVersion: "catalog-offer-monitor-v2",
          checkedAt,
          rawMetadata: {
            offerId: offer.id,
            url: offer.url,
            previousInStock,
            nextInStock,
            availabilityText: checked.availabilityText
          }
        }
      });

      result.alertsTriggered += pipeline.outboxQueued;

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
