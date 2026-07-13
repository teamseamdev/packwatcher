import type { CatalogOffer, StockStatus } from "@/lib/types";

const localPatterns = /\b(pickup|pick up|in store|in-store|store pickup|available at|nearby|curbside|local|ready within|today at)\b/i;
const shippingPatterns = /\b(ship|shipping|delivery|deliver|arrives|free delivery|free shipping)\b/i;
const marketplacePatterns = /\b(tcgplayer|tcg player|tcgcsv|marketplace)\b/i;

export function metadataText(offer: CatalogOffer, key: string) {
  const value = offer.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function fulfillmentText(offer: CatalogOffer) {
  return [
    metadataText(offer, "pickupText"),
    metadataText(offer, "shippingText"),
    offer.availability_text
  ].filter(Boolean).join(" | ");
}

export function fulfillmentLabel(offer: CatalogOffer) {
  if (isLocalOffer(offer)) return "Pickup available";
  if (isShippingOnlyOffer(offer)) return "Shipping only";
  if (offer.status === "delivery_available") return "Delivery available";
  if (offer.status === "out_of_stock" || offer.status === "unavailable") return "Out of stock";
  if (offer.status === "preorder") return "Preorder";
  if (offer.status === "backorder") return "Backorder";
  if (offer.status === "limited_stock") return "Limited stock";
  if (isAvailableStatus(offer.status) || offer.in_stock === true) return "Availability found";
  return "Check retailer";
}

export function fulfillmentTone(offer: CatalogOffer) {
  if (isLocalOffer(offer)) return "bg-emerald-300 text-slate-950";
  if (isShippingOnlyOffer(offer)) return "bg-sky-300 text-slate-950";
  if (offer.status === "out_of_stock" || offer.status === "unavailable") return "bg-red-400/20 text-red-100";
  if (isAvailableStatus(offer.status) || offer.in_stock === true) return "bg-white/10 text-slate-200";
  return "bg-white/10 text-slate-300";
}

export function compareCatalogOffers(a: CatalogOffer, b: CatalogOffer, postalCode?: string | null) {
  const rankDifference = offerPriority(a, postalCode) - offerPriority(b, postalCode);
  if (rankDifference !== 0) return rankDifference;

  const priceDifference = normalizedPrice(a) - normalizedPrice(b);
  if (priceDifference !== 0) return priceDifference;

  const checkedDifference = new Date(b.last_checked_at ?? 0).getTime() - new Date(a.last_checked_at ?? 0).getTime();
  if (checkedDifference !== 0) return checkedDifference;

  return a.store_name.localeCompare(b.store_name);
}

export function offerPriority(offer: CatalogOffer, postalCode?: string | null) {
  const local = isLocalOffer(offer);
  const zipMatch = isZipBiasedOffer(offer, postalCode);
  const available = isAvailableStatus(offer.status) || offer.in_stock === true;
  const shippingOnly = isShippingOnlyOffer(offer);
  const marketplace = isMarketplaceOffer(offer);

  if (local && zipMatch && available) return 0;
  if (local && available) return 1;
  if (local) return 2;
  if (available && !shippingOnly && !marketplace) return 3;
  if (!shippingOnly && !marketplace) return 4;
  if (shippingOnly && !marketplace) return 8;
  return 9;
}

export function isLocalOffer(offer: CatalogOffer) {
  const text = [metadataText(offer, "pickupText"), offer.availability_text, offer.status].filter(Boolean).join(" ");
  return offer.status === "pickup_available" || localPatterns.test(text);
}

export function isShippingOnlyOffer(offer: CatalogOffer) {
  if (isLocalOffer(offer)) return false;
  const text = [metadataText(offer, "shippingText"), offer.availability_text, offer.status].filter(Boolean).join(" ");
  return offer.status === "shipping_available" || shippingPatterns.test(text);
}

export function isMarketplaceOffer(offer: CatalogOffer) {
  const text = [offer.store_name, offer.retailer, offer.url, offer.title, metadataText(offer, "source"), metadataText(offer, "provider")].filter(Boolean).join(" ");
  return marketplacePatterns.test(text);
}

function isZipBiasedOffer(offer: CatalogOffer, postalCode?: string | null) {
  const normalizedZip = postalCode?.trim();
  if (!normalizedZip) return false;
  const offerZip = metadataText(offer, "postalCode");
  const localRequested = offer.metadata?.localSearchRequested === true;
  return offerZip === normalizedZip || localRequested;
}

function isAvailableStatus(status: StockStatus) {
  return ["in_stock", "limited_stock", "pickup_available", "shipping_available", "delivery_available"].includes(status);
}

function normalizedPrice(offer: CatalogOffer) {
  const price = offer.last_price ?? offer.price;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : Number.MAX_SAFE_INTEGER;
}
