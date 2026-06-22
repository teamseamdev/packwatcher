import { genericCheck } from "@/lib/stock-checkers/generic";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";

export const pokemonCenterAdapter: RetailerAdapter = {
  name: "pokemon-center",
  matches: (url, storeName) => /pokemoncenter\.com/i.test(url) || /pokemon center/i.test(storeName),
  check: genericCheck
};
