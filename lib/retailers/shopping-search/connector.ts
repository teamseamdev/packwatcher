import type { ShoppingSearchProvider, ShoppingSearchResult } from "@/lib/retailers/shared/types";

type ProviderResponseItem = {
  title?: string;
  retailer?: string;
  productUrl?: string;
  product_url?: string;
  price?: number | string | null;
  sellerName?: string;
  seller_name?: string;
  imageUrl?: string;
  image_url?: string;
  sourceUrl?: string;
  source_url?: string;
  confidence?: number;
};

function parsePrice(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d{2})?)/);
  return match ? Number(match[1]) : null;
}

export function createConfiguredShoppingSearchProvider(): ShoppingSearchProvider | null {
  const endpoint = process.env.SHOPPING_SEARCH_API_URL;
  const apiKey = process.env.SHOPPING_SEARCH_API_KEY;
  const providerName = process.env.SHOPPING_SEARCH_PROVIDER ?? "configured-shopping-search";

  if (!endpoint || !apiKey) return null;

  return {
    name: providerName,
    async searchProducts(query: string): Promise<ShoppingSearchResult[]> {
      const url = new URL(endpoint);
      url.searchParams.set("q", query);

      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json"
        },
        next: { revalidate: 0 }
      });

      if (!response.ok) {
        throw new Error(`${providerName} search failed with HTTP ${response.status}`);
      }

      const body = await response.json() as { results?: ProviderResponseItem[]; items?: ProviderResponseItem[] };
      const items = body.results ?? body.items ?? [];
      const retrievedAt = new Date().toISOString();

      return items.flatMap((item) => {
        const productUrl = item.productUrl ?? item.product_url;
        if (!item.title || !item.retailer || !productUrl) return [];
        return [{
          provider: providerName,
          title: item.title,
          retailer: item.retailer,
          productUrl,
          price: parsePrice(item.price),
          sellerName: item.sellerName ?? item.seller_name ?? null,
          imageUrl: item.imageUrl ?? item.image_url ?? null,
          sourceUrl: item.sourceUrl ?? item.source_url ?? productUrl,
          retrievedAt,
          confidence: item.confidence ?? 0.6
        }];
      });
    }
  };
}
