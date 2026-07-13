import { isGoogleUrl, resolveRetailerUrl } from "@/lib/catalog/retailer-url";
import type { ShoppingSearchProvider, ShoppingSearchResult } from "@/lib/retailers/shared/types";

type ProviderResponseItem = {
  title?: string;
  retailer?: string;
  source?: string;
  productUrl?: string;
  product_url?: string;
  link?: string;
  price?: number | string | null;
  extracted_price?: number | null;
  sellerName?: string;
  seller_name?: string;
  imageUrl?: string;
  image_url?: string;
  thumbnail?: string;
  delivery?: string;
  shipping?: string;
  pickup?: string;
  availability?: string;
  extensions?: string[];
  sourceUrl?: string;
  source_url?: string;
  product_link?: string;
  direct_link?: string;
  merchant_link?: string;
  confidence?: number;
};

function parsePrice(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d{2})?)/);
  const parsed = match ? Number(match[1]) : null;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function joinedExtensions(item: ProviderResponseItem) {
  return Array.isArray(item.extensions) ? item.extensions.filter(Boolean).join(" | ") : null;
}

export function createConfiguredShoppingSearchProvider(): ShoppingSearchProvider | null {
  const configuredProvider = (process.env.SHOPPING_SEARCH_PROVIDER ?? "").toLowerCase().trim();
  const endpoint =
    process.env.SHOPPING_SEARCH_API_URL ||
    (configuredProvider === "serpapi" ? "https://serpapi.com/search" : "") ||
    (configuredProvider === "searchapi" ? "https://www.searchapi.io/api/v1/search" : "");
  const apiKey = process.env.SHOPPING_SEARCH_API_KEY;
  const providerName = configuredProvider || "configured-shopping-search";

  if (!endpoint || !apiKey) return null;

  return {
    name: providerName,
    async searchProducts(query: string, options?: { postalCode?: string | null }): Promise<ShoppingSearchResult[]> {
      const url = new URL(endpoint);
      url.searchParams.set("q", query);
      const postalCode = options?.postalCode?.trim();
      if (providerName === "serpapi") {
        url.searchParams.set("engine", "google_shopping");
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("gl", "us");
        url.searchParams.set("hl", "en");
        if (postalCode) url.searchParams.set("location", postalCode);
      }
      if (providerName === "searchapi") {
        url.searchParams.set("engine", "google_shopping");
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("gl", "us");
        url.searchParams.set("hl", "en");
        if (postalCode) url.searchParams.set("location", postalCode);
      }

      const response = await fetch(url, {
        headers: providerName === "serpapi" || providerName === "searchapi"
          ? { accept: "application/json" }
          : { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        next: { revalidate: 0 }
      });

      if (!response.ok) {
        throw new Error(`${providerName} search failed with HTTP ${response.status}`);
      }

      const body = await response.json() as { results?: ProviderResponseItem[]; items?: ProviderResponseItem[]; shopping_results?: ProviderResponseItem[] };
      const items = body.shopping_results ?? body.results ?? body.items ?? [];
      const retrievedAt = new Date().toISOString();

      return items.flatMap((item) => {
        const retailer = item.retailer ?? item.source;
        const rawProductUrl = item.productUrl ?? item.product_url ?? item.direct_link ?? item.merchant_link ?? item.link ?? item.product_link;
        const productUrl = resolveRetailerUrl(rawProductUrl, retailer, item.title);
        if (!item.title || !retailer || !productUrl) return [];
        if (isGoogleUrl(productUrl)) return [];
        return [{
          provider: providerName,
          title: item.title,
          retailer,
          productUrl,
          price: parsePrice(item.extracted_price) ?? parsePrice(item.price),
          sellerName: item.sellerName ?? item.seller_name ?? null,
          imageUrl: item.imageUrl ?? item.image_url ?? item.thumbnail ?? null,
          availabilityText: textOrNull(item.availability) ?? joinedExtensions(item),
          shippingText: textOrNull(item.delivery) ?? textOrNull(item.shipping),
          pickupText: textOrNull(item.pickup),
          sourceUrl: item.sourceUrl ?? item.source_url ?? rawProductUrl ?? productUrl,
          retrievedAt,
          confidence: item.confidence ?? 0.6
        }];
      });
    }
  };
}
