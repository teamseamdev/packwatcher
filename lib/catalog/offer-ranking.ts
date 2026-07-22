import { distanceMiles, numberFromUnknown, parseCoordinates, type Coordinates } from "../location/distance.ts";
import type { CatalogOffer, StockStatus } from "../types.ts";
import { fulfillmentLabelForStatus, isAvailableCatalogStatus, isCatalogOfferAvailable } from "./offer-availability.ts";

const localPatterns = /\b(pickup|pick up|in store|in-store|store pickup|available at|nearby|curbside|local|ready within|today at)\b/i;
const shippingPatterns = /\b(ship|shipping|delivery|deliver|arrives|free delivery|free shipping)\b/i;
const marketplacePatterns = /\b(tcgplayer|tcg player|tcgcsv|marketplace)\b/i;

export function metadataText(offer: CatalogOffer, key: string) {
  const value = offer.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function fulfillmentText(offer: CatalogOffer) {
  const availabilityText = usefulAvailabilityText(offer.availability_text);
  return [
    metadataText(offer, "pickupText"),
    metadataText(offer, "shippingText"),
    availabilityText
  ].filter(Boolean).join(" | ");
}

export function verificationLabel(offer: CatalogOffer) {
  if (offer.metadata?.verifiedByRetailerConnector === true) return "Verified by retailer";
  if (metadataText(offer, "verificationStatus") === "verified") return "Verified by retailer";
  if (metadataText(offer, "verificationStatus") === "discovery") return "Discovery result";
  if (metadataText(offer, "discoverySource") === "shopping-search" || metadataText(offer, "source") === "shopping-search") {
    return "Discovery result";
  }
  if (offer.last_checked_at) return "Checked";
  return "Needs confirmation";
}

export function verificationText(offer: CatalogOffer) {
  if (offer.metadata?.verifiedByRetailerConnector === true || metadataText(offer, "verificationStatus") === "verified") {
    return "Availability was checked against the retailer page.";
  }
  if (metadataText(offer, "verificationStatus") === "discovery" || metadataText(offer, "discoverySource") === "shopping-search" || metadataText(offer, "source") === "shopping-search") {
    return "Discovered through shopping/search data. Stock and pickup details should be confirmed at the retailer before buying.";
  }
  return "Open the retailer page to confirm current stock before buying.";
}

export function fulfillmentLabel(offer: CatalogOffer) {
  return fulfillmentLabelForStatus(offer.status, isLocalOffer(offer), isShippingOnlyOffer(offer));
}

export function fulfillmentTone(offer: CatalogOffer) {
  if (isLocalOffer(offer)) return "bg-emerald-300 text-slate-950";
  if (isShippingOnlyOffer(offer)) return "bg-sky-300 text-slate-950";
  if (offer.status === "out_of_stock" || offer.status === "unavailable") return "bg-red-400/20 text-red-100";
  if (isAvailableStatus(offer.status) || offer.in_stock === true) return "bg-white/10 text-slate-200";
  return "bg-white/10 text-slate-300";
}

export type OfferRankingLocation = {
  postalCode?: string | null;
  coordinates?: Coordinates | null;
};

export function compareCatalogOffers(a: CatalogOffer, b: CatalogOffer, location?: string | OfferRankingLocation | null) {
  const rankDifference = offerPriority(a, location) - offerPriority(b, location);
  if (rankDifference !== 0) return rankDifference;

  const distanceDifference = normalizedDistance(a, location) - normalizedDistance(b, location);
  if (distanceDifference !== 0) return distanceDifference;

  const priceDifference = normalizedPrice(a) - normalizedPrice(b);
  if (priceDifference !== 0) return priceDifference;

  const checkedDifference = new Date(b.last_checked_at ?? 0).getTime() - new Date(a.last_checked_at ?? 0).getTime();
  if (checkedDifference !== 0) return checkedDifference;

  return a.store_name.localeCompare(b.store_name);
}

export function offerPriority(offer: CatalogOffer, location?: string | OfferRankingLocation | null) {
  const local = isLocalOffer(offer);
  const zipMatch = isZipBiasedOffer(offer, location);
  const available = isCatalogOfferAvailable(offer);
  const shippingOnly = isShippingOnlyOffer(offer);
  const marketplace = isMarketplaceOffer(offer);
  const hasDistance = normalizedDistance(offer, location) < Number.MAX_SAFE_INTEGER;

  if (local && zipMatch && available && hasDistance) return 0;
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

export function offerDistanceMiles(offer: CatalogOffer, location?: string | OfferRankingLocation | null) {
  const explicitDistance = numberFromUnknown(offer.metadata?.distanceMiles ?? offer.metadata?.distance_miles);
  if (explicitDistance !== null && explicitDistance >= 0) return explicitDistance;

  const userCoordinates = normalizeRankingLocation(location).coordinates;
  const storeCoordinates = parseCoordinates(offer.metadata?.storeCoordinates)
    ?? parseCoordinates(offer.metadata)
    ?? parseCoordinates(offer.metadata?.store);

  if (!userCoordinates || !storeCoordinates) return null;
  return distanceMiles(userCoordinates, storeCoordinates);
}

export function distanceLabel(offer: CatalogOffer, location?: string | OfferRankingLocation | null) {
  const distance = offerDistanceMiles(offer, location);
  if (distance === null) return null;
  return `${distance < 10 ? distance.toFixed(1) : Math.round(distance)} miles`;
}

function normalizedDistance(offer: CatalogOffer, location?: string | OfferRankingLocation | null) {
  if (!isLocalOffer(offer)) return Number.MAX_SAFE_INTEGER;
  const distance = offerDistanceMiles(offer, location);
  return distance === null ? Number.MAX_SAFE_INTEGER : distance;
}

function isZipBiasedOffer(offer: CatalogOffer, location?: string | OfferRankingLocation | null) {
  const normalizedZip = normalizeRankingLocation(location).postalCode?.trim();
  if (!normalizedZip) return false;
  const offerZip = metadataText(offer, "postalCode");
  const localRequested = offer.metadata?.localSearchRequested === true;
  return offerZip === normalizedZip || localRequested;
}

function normalizeRankingLocation(location?: string | OfferRankingLocation | null): OfferRankingLocation {
  if (!location) return {};
  if (typeof location === "string") return { postalCode: location };
  return location;
}

function isAvailableStatus(status: StockStatus) {
  return isAvailableCatalogStatus(status);
}

function normalizedPrice(offer: CatalogOffer) {
  const price = offer.last_price ?? offer.price;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : Number.MAX_SAFE_INTEGER;
}

function usefulAvailabilityText(text: string | null) {
  if (!text) return null;
  const normalized = text.trim();
  if (!normalized) return null;
  if (/^matched\s+"?(in stock|available|add to cart|buy now)"?$/i.test(normalized)) return null;
  if (/^in stock$/i.test(normalized)) return null;
  return normalized;
}
