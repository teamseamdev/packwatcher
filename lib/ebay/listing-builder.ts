import type { EbayListingDefaults, InventoryItem } from "@/lib/types";

export function ebayCardTitle(item: InventoryItem) {
  const cardName = item.card_name || parseInventoryName(item.name).cardName || item.name;
  const parts = [
    cardName,
    item.card_number || parseInventoryName(item.name).cardNumber,
    item.set_name || parseInventoryName(item.name).setName,
    item.variant,
    item.foil ? "Foil" : null,
    "Pokemon TCG"
  ].filter(Boolean);
  return parts.join(" - ").slice(0, 80);
}

export function ebayCardDescription(item: InventoryItem) {
  const parsed = parseInventoryName(item.name);
  return [
    ebayCardTitle(item),
    "",
    `Card: ${item.card_name || parsed.cardName || item.name}`,
    item.set_name || parsed.setName ? `Set: ${item.set_name || parsed.setName}` : null,
    item.card_number || parsed.cardNumber ? `Card number: ${item.card_number || parsed.cardNumber}` : null,
    item.variant ? `Finish/variant: ${item.variant}` : null,
    `Foil: ${item.foil ? "Yes" : "No"}`,
    item.language ? `Language: ${item.language}` : null,
    "",
    "Please review photos and listing details before purchasing."
  ].filter(Boolean).join("\n");
}

export function defaultEbayListingDefaults(userId: string, overrides?: Partial<EbayListingDefaults> | null): EbayListingDefaults {
  return {
    user_id: userId,
    marketplace_id: overrides?.marketplace_id ?? "EBAY_US",
    category_id: overrides?.category_id ?? "183454",
    merchant_location_key: overrides?.merchant_location_key ?? null,
    payment_policy_id: overrides?.payment_policy_id ?? null,
    return_policy_id: overrides?.return_policy_id ?? null,
    fulfillment_policy_id: overrides?.fulfillment_policy_id ?? null,
    condition: overrides?.condition ?? "USED_EXCELLENT",
    currency: overrides?.currency ?? "USD",
    listing_duration: overrides?.listing_duration ?? "GTC",
    updated_at: overrides?.updated_at ?? new Date().toISOString()
  };
}

export function missingEbayDefaults(defaults: EbayListingDefaults) {
  return [
    defaults.merchant_location_key ? null : "Merchant location key",
    defaults.payment_policy_id ? null : "Payment policy ID",
    defaults.return_policy_id ? null : "Return policy ID",
    defaults.fulfillment_policy_id ? null : "Shipping/fulfillment policy ID"
  ].filter(Boolean) as string[];
}

function parseInventoryName(name: string) {
  const parts = name.split(" - ").map((part) => part.trim()).filter(Boolean);
  return {
    cardName: parts[0] ?? name,
    cardNumber: parts[1]?.match(/\d{1,4}(?:\s*\/\s*\d{1,4})?/)?.[0] ?? null,
    setName: parts.length >= 3 ? parts.slice(2).join(" - ") : null
  };
}
