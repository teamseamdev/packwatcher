import type { CatalogOffer, StockStatus } from "../types.ts";

export type OfferAvailabilityClassification = {
  status: StockStatus;
  inStock: boolean;
  availabilityType: "online" | "local" | "marketplace";
  shippingAvailable: boolean | null;
  pickupAvailable: boolean | null;
  deliveryAvailable: boolean | null;
  confidence: number;
  fulfillmentLabel: string;
};

const availableStatuses = new Set<StockStatus>([
  "in_stock",
  "limited_stock",
  "preorder",
  "backorder",
  "pickup_available",
  "shipping_available",
  "delivery_available",
  "pickup_only",
  "shipping_only",
  "delivery_only"
]);

const unavailableStatuses = new Set<StockStatus>([
  "out_of_stock",
  "unavailable",
  "unavailable_at_location",
  "listing_removed",
  "blocked",
  "error"
]);

const pickupPattern = /\b(pickup|pick up|in store|in-store|store pickup|available at|curbside|ready within|pickup today|pickup tomorrow)\b/i;
const shippingPattern = /\b(ship|shipping|delivery|deliver|arrives|free delivery|free shipping|prime|add to cart|add for shipping)\b/i;
const deliveryPattern = /\b(delivery|same day delivery|deliver to|delivered)\b/i;
const unavailablePattern = /\b(out of stock|sold out|unavailable|not available|notify me|currently unavailable|no longer available)\b/i;
const limitedPattern = /\b(limited stock|only \d+ left|low stock|few left)\b/i;
const preorderPattern = /\b(preorder|pre-order)\b/i;
const backorderPattern = /\b(backorder|back order)\b/i;

export function isAvailableCatalogStatus(status: StockStatus | null | undefined) {
  return status ? availableStatuses.has(status) : false;
}

export function isUnavailableCatalogStatus(status: StockStatus | null | undefined) {
  return status ? unavailableStatuses.has(status) : false;
}

export function isCatalogOfferAvailable(offer: Pick<CatalogOffer, "status" | "in_stock">) {
  return offer.in_stock === true || isAvailableCatalogStatus(offer.status);
}

export function classifyOfferAvailability(input: {
  status?: StockStatus | null;
  availabilityText?: string | null;
  shippingText?: string | null;
  pickupText?: string | null;
  retailer?: string | null;
  sourceConfidence?: number | null;
  verifiedByRetailerConnector?: boolean;
}): OfferAvailabilityClassification {
  const text = [
    input.status,
    input.availabilityText,
    input.shippingText,
    input.pickupText
  ].filter(Boolean).join(" ");
  const hasPickup = Boolean(input.pickupText?.trim()) || pickupPattern.test(text);
  const hasShipping = Boolean(input.shippingText?.trim()) || shippingPattern.test(text);
  const hasDelivery = deliveryPattern.test(text);
  const unavailable = unavailablePattern.test(text);

  let status = input.status ?? "unknown";
  if (status === "unknown" || status === "in_stock") {
    if (unavailable && !hasPickup && !hasShipping && !hasDelivery) status = "out_of_stock";
    else if (preorderPattern.test(text)) status = "preorder";
    else if (backorderPattern.test(text)) status = "backorder";
    else if (limitedPattern.test(text)) status = "limited_stock";
    else if (hasPickup && !hasShipping) status = "pickup_available";
    else if (hasShipping && !hasPickup) status = "shipping_only";
    else if (hasDelivery && !hasPickup) status = "delivery_available";
    else if (hasPickup && hasShipping) status = "in_stock";
    else if (hasShipping) status = "shipping_available";
  }

  const inStock = isAvailableCatalogStatus(status);
  const availabilityType = hasPickup ? "local" : marketplaceRetailer(input.retailer) ? "marketplace" : "online";
  const sourceConfidence = typeof input.sourceConfidence === "number" && Number.isFinite(input.sourceConfidence)
    ? Math.max(0, Math.min(1, input.sourceConfidence))
    : 0.6;
  const confidence = input.verifiedByRetailerConnector
    ? Math.max(0.78, sourceConfidence)
    : Math.min(0.72, sourceConfidence);

  return {
    status,
    inStock,
    availabilityType,
    shippingAvailable: hasShipping ? true : hasPickup ? false : null,
    pickupAvailable: hasPickup ? true : hasShipping ? false : null,
    deliveryAvailable: hasDelivery ? true : null,
    confidence,
    fulfillmentLabel: fulfillmentLabelForStatus(status, hasPickup, hasShipping)
  };
}

export function fulfillmentLabelForStatus(status: StockStatus, hasPickup = false, hasShipping = false) {
  if (status === "pickup_available" || status === "pickup_only" || hasPickup) return "Pickup available";
  if (status === "shipping_only") return "Shipping only";
  if (status === "shipping_available" || hasShipping) return "Shipping available";
  if (status === "delivery_available" || status === "delivery_only") return "Delivery available";
  if (status === "out_of_stock" || status === "unavailable" || status === "unavailable_at_location") return "Out of stock";
  if (status === "preorder") return "Preorder";
  if (status === "backorder") return "Backorder";
  if (status === "limited_stock") return "Limited stock";
  if (isAvailableCatalogStatus(status)) return "Availability found";
  return "Check retailer";
}

function marketplaceRetailer(retailer: string | null | undefined) {
  return /\b(tcgplayer|tcg player|ebay|amazon marketplace|marketplace)\b/i.test(retailer ?? "");
}
