import { genericCheck } from "@/lib/stock-checkers/generic";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";

export const bestBuyAdapter: RetailerAdapter = {
  name: "bestbuy",
  matches: (url, storeName) => /bestbuy\.com/i.test(url) || /best\s?buy/i.test(storeName),
  check: genericCheck
};
