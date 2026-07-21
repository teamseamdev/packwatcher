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
  | "unavailable"
  | "coming_soon"
  | "pickup_only"
  | "shipping_only"
  | "delivery_only"
  | "unavailable_at_location"
  | "listing_removed"
  | "blocked"
  | "error";

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
  canonical_set_id?: string | null;
  canonical_card_id?: string | null;
  scan_event_id?: string | null;
  card_name?: string | null;
  set_name?: string | null;
  card_number?: string | null;
  variant?: string | null;
  foil?: boolean | null;
  language?: string | null;
  condition?: string | null;
  created_at: string;
};

export type EbayConnection = {
  user_id: string;
  ebay_user_id: string | null;
  ebay_username: string | null;
  environment: string;
  token_scope: string | null;
  refresh_token_expires_at: string | null;
  connected_at: string;
  updated_at: string;
};

export type EbayListingDefaults = {
  user_id: string;
  marketplace_id: string;
  category_id: string;
  merchant_location_key: string | null;
  payment_policy_id: string | null;
  return_policy_id: string | null;
  fulfillment_policy_id: string | null;
  condition: string;
  currency: string;
  listing_duration: string;
  updated_at: string;
};

export type EbayListing = {
  id: string;
  user_id: string;
  inventory_item_id: string | null;
  sku: string;
  offer_id: string | null;
  listing_id: string | null;
  listing_url: string | null;
  status: string;
  title: string;
  price: number;
  quantity: number;
  payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackType = "suggestion" | "bug" | "issue" | "other";
export type FeedbackStatus = "new" | "reviewed" | "in_progress" | "handled" | "closed";

export type FeedbackStatusEvent = {
  id: string;
  feedback_id: string;
  admin_user_id: string | null;
  previous_status: FeedbackStatus | null;
  next_status: FeedbackStatus;
  note: string | null;
  created_at: string;
  profiles?: Pick<Profile, "email"> | null;
};

export type FeedbackItem = {
  id: string;
  user_id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  title: string;
  message: string;
  page_url: string | null;
  browser_info: string | null;
  status_note: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "email"> | null;
  feedback_status_events?: FeedbackStatusEvent[];
};
