export function statusForInStockMatch(match: string) {
  if (/\bpickup|pick up|in store|in-store\b/i.test(match)) return "pickup_available";
  if (/\bship|shipping|delivery|deliver\b/i.test(match)) return "shipping_available";
  return "in_stock";
}
