import { isGoogleUrl, resolveRetailerUrl } from "../../catalog/retailer-url.ts";
import type { ShoppingSearchProvider, ShoppingSearchResult } from "../shared/types.ts";

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
  asin?: string;
  product_id?: string;
  product_id_text?: string;
  product_page_url?: string;
  link_clean?: string;
  condition?: string;
  stock?: string;
  seller?: string | { name?: string };
  prime?: boolean;
  position?: number;
  rating?: number;
  reviews?: number;
  primary_offer?: {
    offer_price?: string;
    extracted_offer_price?: number;
    availability?: string;
  };
};

type SerpApiEngine = "google_shopping" | "walmart" | "amazon" | "ebay";

type SerpApiResponse = {
  shopping_results?: ProviderResponseItem[];
  organic_results?: ProviderResponseItem[];
  results?: ProviderResponseItem[];
  items?: ProviderResponseItem[];
  error?: string;
  search_metadata?: {
    status?: string;
  };
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

function joinedText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(" | ") || null;
  return textOrNull(value);
}

function sellerName(item: ProviderResponseItem) {
  if (typeof item.seller === "string") return item.seller;
  if (item.seller && typeof item.seller === "object") return textOrNull(item.seller.name);
  return item.sellerName ?? item.seller_name ?? null;
}

function serpApiEngines() {
  const configured = process.env.SERPAPI_SEARCH_ENGINES ?? process.env.SHOPPING_SEARCH_ENGINES;
  const engines = (configured || "google_shopping,walmart,amazon,ebay")
    .split(",")
    .map((engine) => engine.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(engines)).filter((engine): engine is SerpApiEngine =>
    ["google_shopping", "walmart", "amazon", "ebay"].includes(engine)
  );
}

function applySerpApiParams(url: URL, engine: SerpApiEngine, query: string, apiKey: string, postalCode?: string | null) {
  url.searchParams.set("engine", engine);
  url.searchParams.set("api_key", apiKey);
  switch (engine) {
    case "walmart":
      url.searchParams.set("query", query);
      if (postalCode) url.searchParams.set("location", postalCode);
      break;
    case "amazon":
      url.searchParams.set("k", query);
      url.searchParams.set("amazon_domain", "amazon.com");
      if (postalCode) url.searchParams.set("delivery_zip", postalCode);
      break;
    case "ebay":
      url.searchParams.set("_nkw", query);
      url.searchParams.set("ebay_domain", "ebay.com");
      url.searchParams.set("LH_ItemCondition", "1000");
      if (postalCode) url.searchParams.set("_stpos", postalCode);
      break;
    default:
      url.searchParams.set("q", query);
      url.searchParams.set("gl", "us");
      url.searchParams.set("hl", "en");
      if (postalCode) url.searchParams.set("location", postalCode);
      break;
  }
}

function resultItemsForEngine(engine: SerpApiEngine, body: SerpApiResponse) {
  if (engine === "google_shopping") return body.shopping_results ?? body.results ?? body.items ?? [];
  return body.organic_results ?? body.results ?? body.items ?? [];
}

function retailerForEngine(engine: SerpApiEngine, item: ProviderResponseItem) {
  if (engine === "walmart") return "Walmart";
  if (engine === "amazon") return "Amazon";
  if (engine === "ebay") return "eBay";
  return item.retailer ?? item.source ?? "Retailer";
}

function urlForEngine(engine: SerpApiEngine, item: ProviderResponseItem) {
  if (engine === "amazon") return item.link_clean ?? item.link ?? item.product_link;
  if (engine === "walmart") return item.product_page_url ?? item.productUrl ?? item.product_url ?? item.link ?? item.product_link;
  if (engine === "ebay") return item.link ?? item.product_link;
  return item.productUrl ?? item.product_url ?? item.direct_link ?? item.merchant_link ?? item.link ?? item.product_link;
}

function priceForEngine(item: ProviderResponseItem) {
  return parsePrice(item.extracted_price)
    ?? parsePrice(item.primary_offer?.extracted_offer_price)
    ?? parsePrice(item.price)
    ?? parsePrice(item.primary_offer?.offer_price);
}

function availabilityForEngine(engine: SerpApiEngine, item: ProviderResponseItem) {
  if (item.primary_offer?.availability) return textOrNull(item.primary_offer.availability);
  if (item.stock) return textOrNull(item.stock);
  if (item.availability) return textOrNull(item.availability);
  if (engine === "amazon" && item.prime) return "Prime result";
  return joinedExtensions(item);
}

async function searchSerpApiEngine(input: {
  endpoint: string;
  apiKey: string;
  engine: SerpApiEngine;
  query: string;
  postalCode?: string | null;
  providerName: string;
}): Promise<ShoppingSearchResult[]> {
  const url = new URL(input.endpoint);
  applySerpApiParams(url, input.engine, input.query, input.apiKey, input.postalCode);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`${input.providerName}:${input.engine} search failed with HTTP ${response.status}`);
  }

  const body = await response.json() as SerpApiResponse;
  if (body.error) throw new Error(`${input.providerName}:${input.engine} search failed: ${body.error}`);

  const retrievedAt = new Date().toISOString();
  return resultItemsForEngine(input.engine, body).flatMap((item) => {
    const retailer = retailerForEngine(input.engine, item);
    const rawProductUrl = urlForEngine(input.engine, item);
    const productUrl = resolveRetailerUrl(rawProductUrl, retailer, item.title);
    if (!item.title || !retailer || !productUrl) return [];
    if (isGoogleUrl(productUrl)) return [];
    const shipping = joinedText(item.delivery) ?? textOrNull(item.shipping);
    const sourceUrl = item.sourceUrl ?? item.source_url ?? rawProductUrl ?? productUrl;
    return [{
      provider: `${input.providerName}:${input.engine}`,
      title: item.title,
      retailer,
      productUrl,
      price: priceForEngine(item),
      sellerName: sellerName(item),
      imageUrl: item.imageUrl ?? item.image_url ?? item.thumbnail ?? null,
      availabilityText: availabilityForEngine(input.engine, item),
      shippingText: shipping,
      pickupText: textOrNull(item.pickup),
      sourceUrl,
      retrievedAt,
      confidence: item.confidence ?? (input.engine === "google_shopping" ? 0.62 : 0.68)
    }];
  });
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
      const postalCode = options?.postalCode?.trim();
      if (providerName === "serpapi") {
        const settled = await Promise.allSettled(serpApiEngines().map((engine) => searchSerpApiEngine({
          endpoint,
          apiKey,
          engine,
          query,
          postalCode,
          providerName
        })));
        return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      }

      const url = new URL(endpoint);
      url.searchParams.set("q", query);
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
