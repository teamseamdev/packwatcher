import { genericCheck } from "@/lib/stock-checkers/generic";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";

export const walmartAdapter: RetailerAdapter = {
  name: "walmart",
  matches: (url, storeName) => /walmart\.com/i.test(url) || /walmart/i.test(storeName),
  check: genericCheck
};
