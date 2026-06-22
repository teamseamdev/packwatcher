export function calculateProfit(input: {
  estimatedSalePrice: number;
  purchasePrice: number;
  fees: number;
  shipping: number;
  quantity?: number;
}) {
  const quantity = input.quantity ?? 1;
  const sale = input.estimatedSalePrice * quantity;
  const cost = input.purchasePrice * quantity;
  const fees = input.fees * quantity;
  const shipping = input.shipping * quantity;
  const profit = sale - cost - fees - shipping;
  const profitPercentage = cost > 0 ? (profit / cost) * 100 : 0;
  const roi = cost > 0 ? ((sale - fees - shipping) / cost) * 100 : 0;

  return { sale, cost, fees, shipping, profit, profitPercentage, roi };
}

export function currency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value ?? 0);
}
