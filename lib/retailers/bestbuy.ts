import { bestBuyAdapter } from "@/lib/stock-checkers/bestbuy";
import { createUrlMonitor } from "@/lib/retailers/create-url-monitor";

export const bestBuyMonitor = createUrlMonitor("Best Buy", bestBuyAdapter);
