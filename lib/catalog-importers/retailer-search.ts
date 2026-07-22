import { createHash } from "node:crypto";
import type { ImportedCatalogOffer } from "@/lib/catalog-importers/types";
import { classifyOfferAvailability } from "@/lib/catalog/offer-availability";
import { isLikelyPokemonProduct, pokemonShoppingQuery } from "@/lib/catalog-importers/pokemon-product-filter";
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

function validPrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function firstValidPrice(...values: Array<number | null | undefined>) {
  for (const value of values) {
    const price = validPrice(value);
    if (price !== null) return price;
  }
  return null;
}

function isExpectedRetailerBlock(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\bHTTP (401|403|429)\b/i.test(message);
}

async function buildOffer(source: RetailerSearchSource, url: string): Promise<ImportedCatalogOffer> {
  const metadata = await fetchProductMetadata(url).catch(() => null);
  const adapter = getAdapter(url, source.storeName);
  const check = await adapter.check({ id: url, url, storeName: source.storeName }).catch(() => null);
  const id = sourceProductId(url);
  const price = firstValidPrice(check?.price, metadata?.price);
  const classification = classifyOfferAvailability({
    status: check?.status ?? "unknown",
    availabilityText: check?.rawMatchReason ?? null,
    retailer: source.storeName,
    sourceConfidence: check ? 0.82 : 0.52,
    verifiedByRetailerConnector: Boolean(check)
  });

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
    msrp: price,
    storeName: source.storeName,
    retailerProductId: id,
    url,
    lastPrice: price,
    status: classification.status,
    availabilityText: check?.rawMatchReason ?? "Discovered from retailer search",
    metadata: {
      discoverySource: "retailer-search",
      query: process.env[source.queryEnv] ?? source.defaultQuery,
      verificationStatus: check ? "verified" : "discovery",
      verifiedByRetailerConnector: Boolean(check),
      fulfillmentLabel: classification.fulfillmentLabel,
      shippingAvailable: classification.shippingAvailable,
      pickupAvailable: classification.pickupAvailable,
      deliveryAvailable: classification.deliveryAvailable,
      availabilityType: classification.availabilityType,
      confidence: classification.confidence
    }
  };
}

export async function importPokemonFromRetailerSearch(options: { perRetailerLimit?: number; sourceKeys?: string[]; query?: string; postalCode?: string | null } = {}) {
  const perRetailerLimit = options.perRetailerLimit ?? Number(process.env.RETAILER_SEARCH_LIMIT ?? 12);
  const offers: ImportedCatalogOffer[] = [];
  const errors: string[] = [];
  const shoppingSearch = createConfiguredShoppingSearchProvider();
  const userQuery = options.query ?? process.env.SHOPPING_SEARCH_QUERY ?? "pokemon sealed product";
  const discoveryQuery = pokemonShoppingQuery(userQuery);

  if (shoppingSearch && (!options.sourceKeys || options.sourceKeys.includes("shopping-search"))) {
    try {
      const results = (await shoppingSearch.searchProducts(discoveryQuery, { postalCode: options.postalCode })).slice(0, perRetailerLimit * 2);
      for (const result of results) {
        if (offers.length >= perRetailerLimit) break;
        if (!isLikelyPokemonProduct({ title: result.title, productUrl: result.productUrl, storeName: result.retailer })) continue;

        const retailer = result.retailer || "Retailer";
        const id = sourceProductId(result.productUrl);
        const adapter = getAdapter(result.productUrl, retailer);
        const check = await adapter.check({ id: result.productUrl, url: result.productUrl, storeName: retailer }).catch(() => null);
        const price = firstValidPrice(result.price, check?.price);
        const providerAvailability = [result.availabilityText, result.shippingText, result.pickupText].filter(Boolean).join(" | ");
        const availabilityText = check?.rawMatchReason ?? (providerAvailability || "Discovered by shopping-search provider; stock not verified");
        const classification = classifyOfferAvailability({
          status: check?.status ?? "unknown",
          availabilityText,
          shippingText: result.shippingText,
          pickupText: result.pickupText,
          retailer,
          sourceConfidence: result.confidence,
          verifiedByRetailerConnector: Boolean(check)
        });

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
          msrp: price,
          storeName: retailer,
          retailerProductId: id,
          url: result.productUrl,
          lastPrice: price,
          status: classification.status,
          availabilityText,
          metadata: {
            discoverySource: "shopping-search",
            provider: result.provider,
            verificationStatus: check ? "verified" : "discovery",
            sourceUrl: result.sourceUrl,
            retrievedAt: result.retrievedAt,
            sourceConfidence: result.confidence,
            verifiedByRetailerConnector: Boolean(check),
            providerPrice: result.price,
            checkedPrice: check?.price ?? null,
            availabilityText,
            shippingText: result.shippingText ?? null,
            pickupText: result.pickupText ?? null,
            postalCode: options.postalCode ?? null,
            localSearchRequested: Boolean(options.postalCode),
            fulfillmentLabel: classification.fulfillmentLabel,
            shippingAvailable: classification.shippingAvailable,
            pickupAvailable: classification.pickupAvailable,
            deliveryAvailable: classification.deliveryAvailable,
            availabilityType: classification.availabilityType,
            confidence: classification.confidence
          }
        });
      }
    } catch (error) {
      errors.push(`${shoppingSearch.name}: ${error instanceof Error ? error.message : "shopping search failed"}`);
    }
  }

  for (const source of SOURCES) {
    if (!isEnabled(source, options.sourceKeys)) continue;

    const query = pokemonShoppingQuery(options.query ?? process.env[source.queryEnv] ?? source.defaultQuery);
    const localizedQuery = options.postalCode ? `${query} near ${options.postalCode}` : query;
    try {
      const html = await fetchPageHtml(source.searchUrl(localizedQuery), 1);
      const urls = extractProductUrls(html, source, perRetailerLimit);

      for (const url of urls) {
        try {
          const offer = await buildOffer(source, url);
          if (isLikelyPokemonProduct({ title: offer.title, productUrl: offer.url, storeName: offer.storeName })) {
            offers.push(offer);
          }
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          if (!isExpectedRetailerBlock(error)) {
            errors.push(`${source.storeName} ${url}: ${error instanceof Error ? error.message : "product import failed"}`);
          }
        }
      }
    } catch (error) {
      if (!isExpectedRetailerBlock(error)) {
        errors.push(`${source.storeName} search: ${error instanceof Error ? error.message : "search import failed"}`);
      }
    }
  }

  return { products: offers, offers, errors };
}
