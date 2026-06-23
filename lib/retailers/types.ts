import type { CatalogOffer, CatalogProduct, StockStatus } from "@/lib/types";

export type CheckedOffer = {
  status: StockStatus;
  price: number | null;
  inStock: boolean;
  availabilityText: string;
  checkedAt: string;
  imageUrl?: string | null;
};

export type DiscoveredOffer = {
  retailer: string;
  retailerProductId?: string | null;
  title: string;
  url: string;
  price: number | null;
  currency: string;
  inStock: boolean;
  availabilityText: string;
  imageUrl?: string | null;
};

export type RetailerImportResult = {
  productsImported: number;
  offersImported: number;
  errors: string[];
};

export interface RetailerMonitor {
  name: string;
  matches(url: string, retailer: string): boolean;
  searchCatalogProducts?(): Promise<RetailerImportResult>;
  checkOffer(offer: CatalogOffer): Promise<CheckedOffer>;
  discoverOffersForProduct?(product: CatalogProduct): Promise<DiscoveredOffer[]>;
}
