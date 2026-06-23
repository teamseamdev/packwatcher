export type Plan = "free" | "pro" | "admin";
export type StockStatus = "unknown" | "in_stock" | "out_of_stock";

export type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  plan: Plan;
  created_at: string;
};

export type TrackedProduct = {
  id: string;
  user_id: string;
  name: string;
  store_name: string;
  url: string;
  image_url: string | null;
  category: string | null;
  set_name: string | null;
  msrp: number | null;
  target_price: number | null;
  status: StockStatus;
  last_price: number | null;
  last_checked_at: string | null;
  alerts_enabled: boolean;
  notes: string | null;
  created_at: string;
};

export type CatalogProduct = {
  id: string;
  name: string;
  tcg: string;
  category: string | null;
  set_name: string | null;
  image_url: string | null;
  msrp: number | null;
  created_at: string;
};

export type CatalogOffer = {
  id: string;
  catalog_product_id: string;
  store_name: string;
  url: string;
  status: StockStatus;
  last_price: number | null;
  last_checked_at: string | null;
  created_at: string;
  catalog_products: CatalogProduct | null;
};

export type InventoryItem = {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  purchase_price: number;
  estimated_sale_price: number;
  fees: number;
  shipping: number;
  notes: string | null;
  created_at: string;
};
