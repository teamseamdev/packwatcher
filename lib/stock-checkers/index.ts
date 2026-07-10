import { amazonAdapter } from "@/lib/stock-checkers/amazon";
import { bestBuyAdapter } from "@/lib/stock-checkers/bestbuy";
import { gameStopAdapter } from "@/lib/stock-checkers/gamestop";
import { genericAdapter } from "@/lib/stock-checkers/generic";
import { pokemonCenterAdapter } from "@/lib/stock-checkers/pokemon-center";
import { targetAdapter } from "@/lib/stock-checkers/target";
import type { RetailerAdapter } from "@/lib/stock-checkers/types";
import { walmartAdapter } from "@/lib/stock-checkers/walmart";

const adapters: RetailerAdapter[] = [pokemonCenterAdapter, amazonAdapter, targetAdapter, walmartAdapter, bestBuyAdapter, gameStopAdapter, genericAdapter];

export function getAdapter(url: string, storeName: string) {
  return adapters.find((adapter) => adapter.matches(url, storeName)) ?? genericAdapter;
}
