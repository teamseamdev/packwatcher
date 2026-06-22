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
