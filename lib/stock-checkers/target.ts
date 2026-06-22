import { genericCheck } from "@/lib/stock-checkers/generic";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";

export const targetAdapter: RetailerAdapter = {
  name: "target",
  matches: (url, storeName) => /target\.com/i.test(url) || /target/i.test(storeName),
  check: genericCheck
};
