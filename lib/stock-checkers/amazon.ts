import { fetchPageHtml } from "@/lib/fetch-page-html";
import { detectStockFromHtml } from "@/lib/stock-checkers/generic";
import { extractProductMetadata } from "@/lib/product-metadata";
import type { RetailerAdapter, StockCheckInput, StockCheckResult } from "@/lib/stock-checkers/types";

export const amazonAdapter: RetailerAdapter = {
  name: "amazon",
  matches: (url, storeName) => /amazon\.com/i.test(url) || /amazon/i.test(storeName),
  async check(input: StockCheckInput): Promise<StockCheckResult> {
    const html = await fetchPageHtml(input.url);
    const detected = detectStockFromHtml(html, {
      inStock: ["add to cart", "buy now", "in stock"],
      outOfStock: ["currently unavailable", "temporarily out of stock", "we don't know when or if this item will be back in stock"]
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
};
