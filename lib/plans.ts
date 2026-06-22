export const FREE_TRACKED_PRODUCT_LIMIT = 3;

export const plans = {
  free: {
    name: "FREE",
    price: "$0",
    productLimit: FREE_TRACKED_PRODUCT_LIMIT
  },
  pro: {
    name: "PRO",
    price: "$2",
    productLimit: Number.POSITIVE_INFINITY
  }
} as const;
