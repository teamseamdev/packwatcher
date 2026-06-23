import type { RetailerAdapter } from "@/lib/stock-checkers/types";
import type { RetailerMonitor } from "@/lib/retailers/types";

export function createUrlMonitor(name: string, adapter: RetailerAdapter): RetailerMonitor {
  return {
    name,
    matches: (url, retailer) => adapter.matches(url, retailer),
    async checkOffer(offer) {
      const checked = await adapter.check({
        id: offer.id,
        url: offer.url,
        storeName: offer.retailer ?? offer.store_name
      });

      return {
        status: checked.status,
        price: checked.price,
        inStock: checked.status === "in_stock",
        availabilityText: checked.rawMatchReason,
        checkedAt: checked.checkedAt,
        imageUrl: checked.imageUrl
      };
    }
  };
}
