import { gameStopAdapter } from "@/lib/stock-checkers/gamestop";
import { createUrlMonitor } from "@/lib/retailers/create-url-monitor";

export const gameStopMonitor = {
  ...createUrlMonitor("GameStop", gameStopAdapter),
  matches: (url: string, retailer: string) => /gamestop\.com/i.test(url) || /gamestop/i.test(retailer)
};
