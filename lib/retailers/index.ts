import { genericAdapter } from "@/lib/stock-checkers/generic";
import { createUrlMonitor } from "@/lib/retailers/create-url-monitor";
import { bestBuyMonitor } from "@/lib/retailers/bestbuy";
import { gameStopMonitor } from "@/lib/retailers/gamestop";
import { pokemonCenterMonitor } from "@/lib/retailers/pokemoncenter";
import { targetMonitor } from "@/lib/retailers/target";
import type { RetailerMonitor } from "@/lib/retailers/types";
import { walmartMonitor } from "@/lib/retailers/walmart";

const genericMonitor = createUrlMonitor("Generic retailer", genericAdapter);
const monitors: RetailerMonitor[] = [
  pokemonCenterMonitor,
  targetMonitor,
  walmartMonitor,
  bestBuyMonitor,
  gameStopMonitor,
  genericMonitor
];

export function getRetailerMonitor(url: string, retailer: string) {
  return monitors.find((monitor) => monitor.matches(url, retailer)) ?? genericMonitor;
}

export type { CheckedOffer, DiscoveredOffer, RetailerImportResult, RetailerMonitor } from "@/lib/retailers/types";
