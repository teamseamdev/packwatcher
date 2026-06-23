export type CatalogImportResult = {
  productsUpserted: number;
  offersUpserted: number;
  skipped: number;
  errors: string[];
};

export type ImportedCatalogOffer = {
  source: string;
  sourceProductId: string;
  name: string;
  tcg: string;
  category: string | null;
  setName: string | null;
  imageUrl: string | null;
  msrp: number | null;
  storeName: string;
  url: string;
  lastPrice: number | null;
  status: "unknown" | "in_stock" | "out_of_stock";
};
