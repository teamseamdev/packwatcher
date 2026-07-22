import { detectStockFromHtml, fetchWithRetry } from "@/lib/stock-checkers/generic";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";
import { extractProductMetadata } from "@/lib/product-metadata";

function validPrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function textSnippet(html: string, pattern: RegExp) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  const match = text.match(pattern);
  return match?.[0]?.trim() ?? null;
}

function walmartFulfillmentText(html: string) {
  const shipping =
    textSnippet(html, /shipping,\s*arrives[^.|]{0,80}/i) ??
    textSnippet(html, /in stock\s+for\s+shipping[^.|]{0,80}/i) ??
    textSnippet(html, /delivery[^.|]{0,80}/i);
  const pickup =
    textSnippet(html, /pickup\s+(?:today|tomorrow|available)[^.|]{0,80}/i) ??
    textSnippet(html, /in stock\s+for\s+pickup[^.|]{0,80}/i) ??
    textSnippet(html, /available\s+for\s+pickup[^.|]{0,80}/i);
  return [shipping, pickup].filter(Boolean).join(" | ") || null;
}

async function walmartCheck(input: Parameters<RetailerAdapter["check"]>[0]) {
  const html = await fetchWithRetry(input.url);
  const detected = detectStockFromHtml(html, {
    inStock: ["add to cart", "pickup today", "shipping, arrives", "available for pickup", "available for delivery", "in stock for shipping", "in stock for pickup"],
    outOfStock: ["out of stock", "sold out", "this item is unavailable", "not available"]
  });
  const metadata = extractProductMetadata(html, input.url);
  const fulfillmentText = walmartFulfillmentText(html);

  return {
    ...detected,
    price: validPrice(metadata.price) ?? validPrice(detected.price),
    rawMatchReason: fulfillmentText ? `${detected.rawMatchReason}; ${fulfillmentText}` : detected.rawMatchReason,
    title: metadata.title,
    imageUrl: metadata.imageUrl,
    checkedAt: new Date().toISOString()
  };
}

export const walmartAdapter: RetailerAdapter = {
  name: "walmart",
  matches: (url, storeName) => /walmart\.com/i.test(url) || /walmart/i.test(storeName),
  check: walmartCheck
};
