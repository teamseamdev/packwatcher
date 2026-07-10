import { createHash } from "node:crypto";
import type { ImportedCatalogOffer } from "@/lib/catalog-importers/types";
import { fetchPageHtml } from "@/lib/fetch-page-html";
import { fetchProductMetadata } from "@/lib/product-metadata";
import { createConfiguredShoppingSearchProvider } from "@/lib/retailers/shopping-search/connector";
import { getAdapter } from "@/lib/stock-checkers";

type RetailerSearchSource = {
  key: string;
  storeName: string;
  enabledEnv: string;
  queryEnv: string;
  defaultQuery: string;
  searchUrl(query: string): string;
  productUrlPattern: RegExp;
};

const SOURCES: RetailerSearchSource[] = [
  {
    key: "target",
    storeName: "Target",
    enabledEnv: "TARGET_SEARCH_IMPORT",
    queryEnv: "TARGET_SEARCH_QUERY",
    defaultQuery: "pokemon cards",
    searchUrl: (query) => `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`,
    productUrlPattern: /https?:\/\/(?:www\.)?target\.com\/p\/[^"'<>\\\s]+|\/p\/[^"'<>\\\s]+/gi
  },
  {
    key: "walmart",
    storeName: "Walmart",
    enabledEnv: "WALMART_SEARCH_IMPORT",
    queryEnv: "WALMART_SEARCH_QUERY",
    defaultQuery: "pokemon cards",
    searchUrl: (query) => `https://www.walmart.com/search?q=${encodeURIComponent(query)}`,
    productUrlPattern: /https?:\/\/(?:www\.)?walmart\.com\/ip\/[^"'<>\\\s]+|\/ip\/[^"'<>\\\s]+/gi
  },
  {
    key: "gamestop",
    storeName: "GameStop",
    enabledEnv: "GAMESTOP_SEARCH_IMPORT",
    queryEnv: "GAMESTOP_SEARCH_QUERY",
    defaultQuery: "pokemon cards",
    searchUrl: (query) => `https://www.gamestop.com/search/?q=${encodeURIComponent(query)}`,
    productUrlPattern: /https?:\/\/(?:www\.)?gamestop\.com\/[^"'<>\\\s]+\/products\/[^"'<>\\\s]+|\/[^"'<>\\\s]+\/products\/[^"'<>\\\s]+/gi
  }
];

function isEnabled(source: RetailerSearchSource, sourceKeys?: string[]) {
  if (sourceKeys) return sourceKeys.includes(source.key);
  return process.env[source.enabledEnv] === "true";
}

function absoluteProductUrl(rawUrl: string, source: RetailerSearchSource) {
  const cleaned = rawUrl.replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
  const base =
    source.key === "target" ? "https://www.target.com" :
    source.key === "walmart" ? "https://www.walmart.com" :
    "https://www.gamestop.com";

  try {
    const url = new URL(cleaned, base);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractProductUrls(html: string, source: RetailerSearchSource, limit: number) {
  const urls = new Set<string>();
  for (const match of html.matchAll(source.productUrlPattern)) {
    const url = absoluteProductUrl(match[0], source);
    if (url) urls.add(url);
    if (urls.size >= limit) break;
  }
  return Array.from(urls);
}

function sourceProductId(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

async function buildOffer(source: RetailerSearchSource, url: string): Promise<ImportedCatalogOffer> {
  const metadata = await fetchProductMetadata(url).catch(() => null);
  const adapter = getAdapter(url, source.storeName);
  const check = await adapter.check({ id: url, url, storeName: source.storeName }).catch(() => null);
  const id = sourceProductId(url);

  return {
    source: `retailer-search-${source.key}`,
    sourceProductId: id,
    title: metadata?.title || check?.title || `${source.storeName} Pokemon product`,
    brand: "Pokemon",
    tcg: "pokemon",
    category: "Sealed Product",
    setName: null,
    seriesName: null,
    productType: "Sealed Product",
    imageUrl: metadata?.imageUrl || check?.imageUrl || null,
    msrp: metadata?.price ?? check?.price ?? null,
    storeName: source.storeName,
    retailerProductId: id,
    url,
    lastPrice: check?.price ?? metadata?.price ?? null,
    status: check?.status ?? "unknown",
    availabilityText: check?.rawMatchReason ?? "Discovered from retailer search",
    metadata: {
      discoverySource: "retailer-search",
      query: process.env[source.queryEnv] ?? source.defaultQuery
    }
  };
}

export async function importPokemonFromRetailerSearch(options: { perRetailerLimit?: number; sourceKeys?: string[]; query?: string } = {}) {
  const perRetailerLimit = options.perRetailerLimit ?? Number(process.env.RETAILER_SEARCH_LIMIT ?? 12);
  const offers: ImportedCatalogOffer[] = [];
  const errors: string[] = [];
  const shoppingSearch = createConfiguredShoppingSearchProvider();

  if (shoppingSearch && (!options.sourceKeys || options.sourceKeys.includes("shopping-search"))) {
    const query = options.query ?? process.env.SHOPPING_SEARCH_QUERY ?? "pokemon sealed product";
    try {
      const results = (await shoppingSearch.searchProducts(query)).slice(0, perRetailerLimit);
      for (const result of results) {
        const retailer = result.retailer || "Retailer";
        const id = sourceProductId(result.productUrl);
        const adapter = getAdapter(result.productUrl, retailer);
        const check = await adapter.check({ id: result.productUrl, url: result.productUrl, storeName: retailer }).catch(() => null);

        offers.push({
          source: `shopping-search-${shoppingSearch.name}`,
          sourceProductId: id,
          title: result.title,
          brand: "Pokemon",
          tcg: "pokemon",
          category: "Sealed Product",
          setName: null,
          seriesName: null,
          productType: "Sealed Product",
          imageUrl: result.imageUrl ?? check?.imageUrl ?? null,
          msrp: result.price ?? check?.price ?? null,
          storeName: retailer,
          retailerProductId: id,
          url: result.productUrl,
          lastPrice: check?.price ?? result.price ?? null,
          status: check?.status ?? "unknown",
          availabilityText: check?.rawMatchReason ?? "Discovered by shopping-search provider; stock not verified",
          metadata: {
            discoverySource: "shopping-search",
            provider: result.provider,
            sourceUrl: result.sourceUrl,
            retrievedAt: result.retrievedAt,
            sourceConfidence: result.confidence,
            verifiedByRetailerConnector: Boolean(check)
          }
        });
      }
    } catch (error) {
      errors.push(`${shoppingSearch.name}: ${error instanceof Error ? error.message : "shopping search failed"}`);
    }
  }

  for (const source of SOURCES) {
    if (!isEnabled(source, options.sourceKeys)) continue;

    const query = options.query ?? process.env[source.queryEnv] ?? source.defaultQuery;
    try {
      const html = await fetchPageHtml(source.searchUrl(query), 1);
      const urls = extractProductUrls(html, source, perRetailerLimit);

      for (const url of urls) {
        try {
          offers.push(await buildOffer(source, url));
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          errors.push(`${source.storeName} ${url}: ${error instanceof Error ? error.message : "product import failed"}`);
        }
      }
    } catch (error) {
      errors.push(`${source.storeName} search: ${error instanceof Error ? error.message : "search import failed"}`);
    }
  }

  return { products: offers, offers, errors };
}
