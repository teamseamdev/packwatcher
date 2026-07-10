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
  sourceUrl?: string;
  source_url?: string;
  product_link?: string;
  confidence?: number;
};

function parsePrice(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d{2})?)/);
  return match ? Number(match[1]) : null;
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
    async searchProducts(query: string): Promise<ShoppingSearchResult[]> {
      const url = new URL(endpoint);
      url.searchParams.set("q", query);
      if (providerName === "serpapi") {
        url.searchParams.set("engine", "google_shopping");
        url.searchParams.set("api_key", apiKey);
      }
      if (providerName === "searchapi") {
        url.searchParams.set("engine", "google_shopping");
        url.searchParams.set("api_key", apiKey);
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
        const productUrl = item.productUrl ?? item.product_url ?? item.link ?? item.product_link;
        const retailer = item.retailer ?? item.source;
        if (!item.title || !retailer || !productUrl) return [];
        return [{
          provider: providerName,
          title: item.title,
          retailer,
          productUrl,
          price: item.extracted_price ?? parsePrice(item.price),
          sellerName: item.sellerName ?? item.seller_name ?? null,
          imageUrl: item.imageUrl ?? item.image_url ?? item.thumbnail ?? null,
          sourceUrl: item.sourceUrl ?? item.source_url ?? productUrl,
          retrievedAt,
          confidence: item.confidence ?? 0.6
        }];
      });
    }
  };
}
