import type { StockStatus } from "@/lib/types";

const statusMap: Array<[RegExp, StockStatus]> = [
  [/limited|low stock/i, "limited_stock"],
  [/pickup/i, "pickup_available"],
  [/deliver/i, "delivery_available"],
  [/ship|add to cart|available|in stock/i, "in_stock"],
  [/pre[\s-]?order/i, "preorder"],
  [/back[\s-]?order/i, "backorder"],
  [/sold out|out of stock|unavailable|not available/i, "out_of_stock"]
];

export function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/pokémon|pokemon/g, " ")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\b(poke mon|trading card game|tcg|scarlet violet)\b/g, " ")
    .replace(/\bscarlet\s+violet\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUpc(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length < 8) return null;
  return digits.replace(/^0+/, "");
}

export function normalizeAvailabilityStatus(input: string | null | undefined): StockStatus {
  if (!input) return "unknown";
  const match = statusMap.find(([pattern]) => pattern.test(input));
  return match?.[1] ?? "unknown";
}

export function freshnessLabel(checkedAt: string | null | undefined, now = new Date()) {
  if (!checkedAt) return "unknown";
  const ageMinutes = (now.getTime() - new Date(checkedAt).getTime()) / 60000;
  if (ageMinutes <= 15) return "fresh";
  if (ageMinutes <= 120) return "delayed";
  return "stale";
}
