import { detectStockFromHtml, fetchWithRetry } from "@/lib/stock-checkers/generic";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";
import { extractProductMetadata } from "@/lib/product-metadata";

async function gameStopCheck(input: Parameters<RetailerAdapter["check"]>[0]) {
  const html = await fetchWithRetry(input.url);
  const detected = detectStockFromHtml(html, {
    inStock: ["add to cart", "pick up at store", "ship to home", "available now"],
    outOfStock: ["not available", "currently unavailable", "out of stock", "sold out"]
  });
  const metadata = extractProductMetadata(html, input.url);

  return {
    ...detected,
    price: detected.price ?? metadata.price,
    title: metadata.title,
    imageUrl: metadata.imageUrl,
    checkedAt: new Date().toISOString()
  };
}

export const gameStopAdapter: RetailerAdapter = {
  name: "gamestop",
  matches: (url, storeName) => /gamestop\.com/i.test(url) || /gamestop/i.test(storeName),
  check: gameStopCheck
};
