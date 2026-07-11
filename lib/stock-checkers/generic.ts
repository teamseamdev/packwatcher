import { fetchPageHtml } from "@/lib/fetch-page-html";
import type { RetailerAdapter, StockCheckInput, StockCheckResult } from "@/lib/stock-checkers/types";
import { extractProductMetadata } from "@/lib/product-metadata";

const inStockPhrases = [
  "in stock",
  "add to cart",
  "add for shipping",
  "available now",
  "ship it",
  "available to ship",
  "shipping available",
  "pickup available"
];
const outOfStockPhrases = [
  "sold out",
  "out of stock",
  "currently unavailable",
  "unavailable",
  "notify me",
  "temporarily out of stock",
  "not available",
  "coming soon"
];

function validPrice(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export async function fetchWithRetry(url: string, retries = 2) {
  return fetchPageHtml(url, retries);
}

export function detectStockFromHtml(
  html: string,
  phrases: { inStock?: string[]; outOfStock?: string[] } = {}
): Pick<StockCheckResult, "status" | "rawMatchReason" | "price"> {
  const normalized = html.replace(/\s+/g, " ").toLowerCase();
  const availability = normalized.match(/https?:\/\/schema\.org\/(instock|outofstock|soldout|preorder|backorder|limitedavailability)/i)?.[1];
  const jsonAvailability = normalized.match(/"availability"\s*:\s*"[^"]*(instock|outofstock|soldout|preorder|backorder|limitedavailability)[^"]*"/i)?.[1];
  const outPhrases = [...(phrases.outOfStock ?? []), ...outOfStockPhrases].map((phrase) => phrase.toLowerCase());
  const inPhrases = [...(phrases.inStock ?? []), ...inStockPhrases].map((phrase) => phrase.toLowerCase());
  const outMatch = outPhrases.find((phrase) => normalized.includes(phrase));
  const inMatch = inPhrases.find((phrase) => normalized.includes(phrase));
  const priceMatch = normalized.match(/\$\s?(\d{1,5}(?:\.\d{2})?)/);
  const price = validPrice(priceMatch ? Number(priceMatch[1]) : null);

  const schemaAvailability = availability ?? jsonAvailability;
  if (schemaAvailability) {
    if (["outofstock", "soldout"].includes(schemaAvailability)) {
      return { status: "out_of_stock", rawMatchReason: `Schema availability "${schemaAvailability}"`, price };
    }
    if (["instock", "limitedavailability", "preorder", "backorder"].includes(schemaAvailability)) {
      return { status: "in_stock", rawMatchReason: `Schema availability "${schemaAvailability}"`, price };
    }
  }

  if (outMatch && !inMatch) {
    return { status: "out_of_stock", rawMatchReason: `Matched "${outMatch}"`, price };
  }

  if (inMatch) {
    return { status: "in_stock", rawMatchReason: `Matched "${inMatch}"`, price };
  }

  return { status: "unknown", rawMatchReason: "No known stock indicator matched", price };
}

export async function genericCheck(input: StockCheckInput): Promise<StockCheckResult> {
  const html = await fetchWithRetry(input.url);
  const detected = detectStockFromHtml(html);
  const metadata = extractProductMetadata(html, input.url);

  return {
    ...detected,
    price: validPrice(detected.price) ?? validPrice(metadata.price),
    title: metadata.title,
    imageUrl: metadata.imageUrl,
    checkedAt: new Date().toISOString()
  };
}

export const genericAdapter: RetailerAdapter = {
  name: "generic",
  matches: () => true,
  check: genericCheck
};
