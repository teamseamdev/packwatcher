import { genericAdapter } from "@/lib/stock-checkers/generic";
import { createUrlMonitor } from "@/lib/retailers/create-url-monitor";

export const gameStopMonitor = {
  ...createUrlMonitor("GameStop", genericAdapter),
  matches: (url: string, retailer: string) => /gamestop\.com/i.test(url) || /gamestop/i.test(retailer)
};
