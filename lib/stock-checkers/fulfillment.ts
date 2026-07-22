export function statusForInStockMatch(match: string) {
  if (/\bpickup|pick up|in store|in-store|curbside\b/i.test(match)) return "pickup_available";
  if (/\bdelivery|deliver\b/i.test(match)) return "delivery_available";
  if (/\bship|shipping|arrives|add for shipping\b/i.test(match)) return "shipping_available";
  return "in_stock";
}
