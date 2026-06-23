import { pokemonCenterAdapter } from "@/lib/stock-checkers/pokemon-center";
import { createUrlMonitor } from "@/lib/retailers/create-url-monitor";

export const pokemonCenterMonitor = createUrlMonitor("Pokemon Center", pokemonCenterAdapter);
