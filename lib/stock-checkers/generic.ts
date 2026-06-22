import type { RetailerAdapter, StockCheckInput, StockCheckResult } from "@/lib/stock-checkers/types";

const inStockPhrases = ["in stock", "add to cart", "add for shipping", "available now", "ship it"];
const outOfStockPhrases = ["sold out", "out of stock", "currently unavailable", "unavailable", "notify me"];

export async function fetchWithRetry(url: string, retries = 2) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "PackWatcher/0.1 safe stock monitor",
          accept: "text/html,application/xhtml+xml"
        },
        next: { revalidate: 0 }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Fetch failed");
}

export function detectStockFromHtml(html: string): Pick<StockCheckResult, "status" | "rawMatchReason" | "price"> {
  const normalized = html.replace(/\s+/g, " ").toLowerCase();
  const outMatch = outOfStockPhrases.find((phrase) => normalized.includes(phrase));
  const inMatch = inStockPhrases.find((phrase) => normalized.includes(phrase));
  const priceMatch = normalized.match(/\$\s?(\d{1,5}(?:\.\d{2})?)/);
  const price = priceMatch ? Number(priceMatch[1]) : null;

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

  return {
    ...detected,
    checkedAt: new Date().toISOString()
  };
}

export const genericAdapter: RetailerAdapter = {
  name: "generic",
  matches: () => true,
  check: genericCheck
};
