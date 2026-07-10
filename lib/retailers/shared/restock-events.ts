import type { ProductAlert, StockStatus } from "../../types.ts";

export type RestockSnapshot = {
  retailerProductId: string;
  retailer: string;
  productId: string;
  status: StockStatus;
  previousStatus: StockStatus | null;
  price: number | null;
  sellerName?: string | null;
  officialRetailerSeller: boolean;
  availabilityType: "online" | "local" | "marketplace";
  storeId?: string | null;
};

const availableStatuses: StockStatus[] = ["in_stock", "limited_stock", "shipping_available", "pickup_available", "delivery_available", "preorder", "backorder"];

export function shouldSendRestockAlert(alert: ProductAlert, snapshot: RestockSnapshot) {
  const becameAvailable = !snapshot.previousStatus || !availableStatuses.includes(snapshot.previousStatus)
    ? availableStatuses.includes(snapshot.status)
    : false;
  const priceCrossedThreshold = typeof alert.max_price === "number" && snapshot.price !== null && snapshot.price <= alert.max_price;
  const retailerAllowed = !alert.preferred_retailers?.length || alert.preferred_retailers.includes(snapshot.retailer);
  const sellerAllowed = snapshot.officialRetailerSeller || alert.allow_third_party_sellers;
  const localAllowed = snapshot.availabilityType !== "local" || alert.local_pickup;
  const onlineAllowed = snapshot.availabilityType !== "online" || alert.online_only !== false;
  const priceAllowed = typeof alert.max_price !== "number" || snapshot.price === null || snapshot.price <= alert.max_price;

  return retailerAllowed && sellerAllowed && localAllowed && onlineAllowed && priceAllowed && (becameAvailable || priceCrossedThreshold);
}

export function notificationEventKey(userId: string, snapshot: RestockSnapshot) {
  const priceBucket = snapshot.price === null ? "unknown" : Math.round(snapshot.price * 100).toString();
  return [
    userId,
    snapshot.retailerProductId,
    snapshot.availabilityType,
    snapshot.storeId ?? "online",
    priceBucket,
    snapshot.status
  ].join(":");
}
