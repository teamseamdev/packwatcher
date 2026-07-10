import type { StockStatus } from "../../types.ts";

export type PriceListing = {
  retailerProductId: string;
  retailer: string;
  status: StockStatus;
  price: number | null;
  sellerName?: string | null;
  officialRetailerSeller: boolean;
  checkedAt: string | null;
};

export type PriceAggregation = {
  lowestCurrentPrice: number | null;
  highestCurrentPrice: number | null;
  medianCurrentPrice: number | null;
  averageAvailablePrice: number | null;
  qualifyingListingCount: number;
  activeListingCount: number;
  inStockListingCount: number;
  retailerCount: number;
};

const availableStatuses: StockStatus[] = ["in_stock", "limited_stock", "shipping_available", "pickup_available", "delivery_available", "preorder", "backorder"];

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function trimmedAverage(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const trim = sorted.length >= 5 ? 1 : 0;
  const trimmed = sorted.slice(trim, sorted.length - trim);
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

export function aggregatePrices(listings: PriceListing[], options: { includeMarketplace?: boolean } = {}): PriceAggregation {
  const deduped = new Map<string, PriceListing>();
  for (const listing of listings) {
    const key = `${listing.retailer}:${listing.retailerProductId}:${listing.sellerName ?? "retailer"}`;
    if (!deduped.has(key)) deduped.set(key, listing);
  }

  const activeListings = Array.from(deduped.values());
  const inStock = activeListings.filter((listing) => availableStatuses.includes(listing.status));
  const qualifying = inStock.filter((listing) => {
    if (!listing.price || listing.price <= 0) return false;
    if (!options.includeMarketplace && !listing.officialRetailerSeller) return false;
    return listing.price < 10000;
  });
  const prices = qualifying.map((listing) => listing.price as number);

  return {
    lowestCurrentPrice: prices.length ? Math.min(...prices) : null,
    highestCurrentPrice: prices.length ? Math.max(...prices) : null,
    medianCurrentPrice: median(prices),
    averageAvailablePrice: trimmedAverage(prices),
    qualifyingListingCount: qualifying.length,
    activeListingCount: activeListings.length,
    inStockListingCount: inStock.length,
    retailerCount: new Set(activeListings.map((listing) => listing.retailer)).size
  };
}
