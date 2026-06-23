import { targetAdapter } from "@/lib/stock-checkers/target";
import { createUrlMonitor } from "@/lib/retailers/create-url-monitor";

export const targetMonitor = createUrlMonitor("Target", targetAdapter);
