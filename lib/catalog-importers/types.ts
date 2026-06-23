export type CatalogImportResult = {
  productsUpserted: number;
  offersUpserted: number;
  offersChecked: number;
  alertsTriggered: number;
  skippedCount: number;
  errors: string[];
};

export type ImportedCatalogProduct = {
  source: string;
  sourceProductId: string;
  slug?: string | null;
  title: string;
  brand?: string | null;
  tcg: string;
  category: string | null;
  setName: string | null;
  seriesName?: string | null;
  productType?: string | null;
  imageUrl: string | null;
  msrp: number | null;
  metadata?: Record<string, unknown>;
};

export type ImportedCatalogOffer = ImportedCatalogProduct & {
  storeName: string;
  retailerProductId?: string | null;
  url: string;
  lastPrice: number | null;
  status: "unknown" | "in_stock" | "out_of_stock";
  availabilityText?: string | null;
  metadata?: Record<string, unknown>;
};

export type ImportedCatalogPayload = {
  products: ImportedCatalogProduct[];
  offers: ImportedCatalogOffer[];
  errors: string[];
};
