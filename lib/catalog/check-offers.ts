import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyOfferAvailability, isCatalogOfferAvailable } from "@/lib/catalog/offer-availability";
import { getRetailerMonitor } from "@/lib/retailers";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { recordCatalogOfferObservation } from "@/lib/tracker/pipeline";
import type { CatalogOffer, CatalogProduct } from "@/lib/types";

type OfferRow = CatalogOffer & {
  catalog_products: CatalogProduct | null;
};

export async function checkCatalogOffer(supabase: SupabaseClient, offer: OfferRow) {
  if (offer.active === false) return { checked: false, outboxQueued: 0 };

  const previousInStock = offer.in_stock ?? isCatalogOfferAvailable(offer);
  const retailer = offer.retailer ?? offer.store_name;
  const monitor = getRetailerMonitor(offer.url, retailer);
  const checked = await monitor.checkOffer(offer);
  const classification = classifyOfferAvailability({
    status: checked.status,
    availabilityText: checked.availabilityText,
    shippingText: typeof offer.metadata?.shippingText === "string" ? offer.metadata.shippingText : null,
    pickupText: typeof offer.metadata?.pickupText === "string" ? offer.metadata.pickupText : null,
    retailer,
    sourceConfidence: 0.82,
    verifiedByRetailerConnector: true
  });
  const nextInStock = classification.inStock;
  const checkedAt = checked.checkedAt;
  const nextMetadata = {
    ...(offer.metadata ?? {}),
    verifiedByRetailerConnector: true,
    verificationStatus: "verified",
    verifiedAt: checkedAt,
    fulfillmentLabel: classification.fulfillmentLabel,
    shippingAvailable: classification.shippingAvailable,
    pickupAvailable: classification.pickupAvailable,
    deliveryAvailable: classification.deliveryAvailable,
    confidence: classification.confidence
  };

  await supabase
    .from("catalog_offers")
    .update({
      status: classification.status,
      last_price: checked.price ?? offer.last_price,
      price: checked.price ?? offer.price ?? offer.last_price,
      in_stock: nextInStock,
      availability_text: checked.availabilityText,
      last_checked_at: checkedAt,
      updated_at: checkedAt,
      image_url: checked.imageUrl ?? offer.image_url,
      metadata: nextMetadata
    })
    .eq("id", offer.id);

  const pipeline = await recordCatalogOfferObservation({
    supabase,
    offer,
    observation: {
      status: classification.status,
      price: checked.price,
      currency: offer.currency ?? "USD",
      availabilityType: classification.availabilityType,
      shippingAvailable: classification.shippingAvailable,
      pickupAvailable: classification.pickupAvailable,
      deliveryAvailable: classification.deliveryAvailable,
      sellerName: typeof offer.metadata?.sellerName === "string" ? offer.metadata.sellerName : retailer,
      officialRetailerSeller: typeof offer.metadata?.officialRetailerSeller === "boolean" ? offer.metadata.officialRetailerSeller : true,
      confidence: classification.confidence,
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

  return { checked: true, outboxQueued: pipeline.outboxQueued, checkedAt };
}

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
    try {
      const checked = await checkCatalogOffer(supabase, offer);
      if (checked.checked) result.offersChecked += 1;
      result.alertsTriggered += checked.outboxQueued;

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
