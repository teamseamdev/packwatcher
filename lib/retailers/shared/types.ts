import type { StockStatus } from "../../types.ts";

export type RetailerCode =
  | "amazon"
  | "bestbuy"
  | "gamestop"
  | "pokemon-center"
  | "target"
  | "walmart"
  | "shopping-search"
  | "generic";

export type ConnectorSupportState = "connected" | "partially_supported" | "temporarily_unavailable" | "not_supported";

export type UserLocation = {
  postalCode: string;
  radiusMiles?: number;
};

export type RetailerProduct = {
  id?: string;
  productId?: string;
  retailer: RetailerCode | string;
  retailerProductId?: string | null;
  retailerSku?: string | null;
  upc?: string | null;
  asin?: string | null;
  title: string;
  productUrl: string;
  affiliateUrl?: string | null;
  imageUrl?: string | null;
  sellerName?: string | null;
  officialRetailerSeller: boolean;
  sourceProvider?: string | null;
  sourceConfidence?: number;
};

export type ProductDiscoveryInput = {
  query: string;
  limit?: number;
  setName?: string | null;
  productType?: string | null;
};

export type DiscoveredRetailerProduct = RetailerProduct & {
  price?: number | null;
  status?: StockStatus;
  rawMetadata?: Record<string, unknown>;
};

export type NormalizedAvailabilityResult = {
  status: StockStatus;
  price: number | null;
  currency: string;
  availabilityType: "online" | "local" | "marketplace";
  shippingAvailable: boolean | null;
  pickupAvailable: boolean | null;
  deliveryAvailable: boolean | null;
  quantityHint?: string | null;
  sellerName?: string | null;
  officialRetailerSeller: boolean;
  checkedAt: string;
  sourceProvider: string;
  confidence: number;
  rawMetadata?: Record<string, unknown>;
};

export type NormalizedStoreAvailabilityResult = NormalizedAvailabilityResult & {
  storeId: string;
  storeName?: string | null;
  distanceMiles?: number | null;
  purchaseUrl?: string | null;
};

export type RetailerConnector = {
  retailer: RetailerCode;
  supportState: ConnectorSupportState;
  capabilities: {
    productDiscovery: boolean;
    onlineAvailability: boolean;
    localAvailability: boolean;
    priceTracking: boolean;
  };
  discoverProducts?(input: ProductDiscoveryInput): Promise<DiscoveredRetailerProduct[]>;
  checkOnlineAvailability?(retailerProduct: RetailerProduct): Promise<NormalizedAvailabilityResult>;
  checkLocalAvailability?(retailerProduct: RetailerProduct, location: UserLocation): Promise<NormalizedStoreAvailabilityResult[]>;
  buildPurchaseUrl(retailerProduct: RetailerProduct): string;
};

export type ShoppingSearchResult = {
  provider: string;
  title: string;
  retailer: string;
  productUrl: string;
  price: number | null;
  sellerName?: string | null;
  imageUrl?: string | null;
  sourceUrl: string;
  retrievedAt: string;
  confidence: number;
};

export type ShoppingSearchProvider = {
  name: string;
  searchProducts(query: string, options?: { postalCode?: string | null }): Promise<ShoppingSearchResult[]>;
};
