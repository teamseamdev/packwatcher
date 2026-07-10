import { detectStockFromHtml, fetchWithRetry } from "@/lib/stock-checkers/generic";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";
import { extractProductMetadata } from "@/lib/product-metadata";

async function targetCheck(input: Parameters<RetailerAdapter["check"]>[0]) {
  const html = await fetchWithRetry(input.url);
  const detected = detectStockFromHtml(html, {
    inStock: ["add for shipping", "ship it", "pick it up", "available at", "ready within"],
    outOfStock: ["sold out", "out of stock", "currently unavailable", "not sold at"]
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

export const targetAdapter: RetailerAdapter = {
  name: "target",
  matches: (url, storeName) => /target\.com/i.test(url) || /target/i.test(storeName),
  check: targetCheck
};
