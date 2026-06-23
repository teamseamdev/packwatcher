import { walmartAdapter } from "@/lib/stock-checkers/walmart";
import { createUrlMonitor } from "@/lib/retailers/create-url-monitor";

export const walmartMonitor = createUrlMonitor("Walmart", walmartAdapter);
