export type Plan = "free" | "pro" | "founder" | "admin";
export type StockStatus =
  | "unknown"
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "backorder"
  | "limited_stock"
  | "pickup_available"
  | "shipping_available"
  | "delivery_available"
  | "unavailable";

export type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  postal_code: string | null;
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
  slug: string | null;
  title: string | null;
  brand: string | null;
  name: string;
  tcg: string;
  category: string | null;
  set_name: string | null;
  series_name: string | null;
  product_type: string | null;
  image_url: string | null;
  msrp: number | null;
  source: string | null;
  source_product_id: string | null;
  source_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type CatalogOffer = {
  id: string;
  catalog_product_id: string;
  product_id: string | null;
  store_name: string;
  retailer: string | null;
  retailer_product_id: string | null;
  title: string | null;
  url: string;
  status: StockStatus;
  last_price: number | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  in_stock: boolean | null;
  availability_text: string | null;
  last_checked_at: string | null;
  metadata: Record<string, unknown> | null;
  active?: boolean | null;
  created_at: string;
  updated_at: string | null;
  catalog_products: CatalogProduct | null;
};

export type ProductAlert = {
  id: string;
  user_id: string;
  product_id: string;
  notify_push: boolean;
  notify_email: boolean;
  max_price?: number | null;
  preferred_retailers?: string[];
  online_only?: boolean;
  local_pickup?: boolean;
  official_retailer_only?: boolean;
  allow_third_party_sellers?: boolean;
  cooldown_minutes?: number;
  created_at: string;
};

export type InventoryItem = {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  purchase_price: number;
  purchase_date?: string | null;
  estimated_sale_price: number;
  fees: number;
  shipping: number;
  notes: string | null;
  image_url?: string | null;
  created_at: string;
};
