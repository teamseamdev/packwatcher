alter type public.stock_status add value if not exists 'preorder';
alter type public.stock_status add value if not exists 'backorder';
alter type public.stock_status add value if not exists 'limited_stock';
alter type public.stock_status add value if not exists 'pickup_available';
alter type public.stock_status add value if not exists 'shipping_available';
alter type public.stock_status add value if not exists 'delivery_available';
alter type public.stock_status add value if not exists 'unavailable';

alter table public.catalog_products add column if not exists release_date date;
alter table public.catalog_products add column if not exists upc text;
alter table public.catalog_products add column if not exists description text;
alter table public.catalog_products add column if not exists active boolean not null default true;
alter table public.catalog_products add column if not exists popularity_score integer not null default 0;
alter table public.catalog_products add column if not exists search_count integer not null default 0;
alter table public.catalog_products add column if not exists tracking_count integer not null default 0;

alter table public.product_alerts add column if not exists max_price numeric(10,2);
alter table public.product_alerts add column if not exists preferred_retailers text[] not null default '{}'::text[];
alter table public.product_alerts add column if not exists online_only boolean not null default true;
alter table public.product_alerts add column if not exists local_pickup boolean not null default false;
alter table public.product_alerts add column if not exists official_retailer_only boolean not null default true;
alter table public.product_alerts add column if not exists allow_third_party_sellers boolean not null default false;
alter table public.product_alerts add column if not exists cooldown_minutes integer not null default 60;

create table if not exists public.retailer_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  retailer text not null,
  retailer_product_id text,
  retailer_sku text,
  upc text,
  asin text,
  title text not null,
  product_url text not null,
  affiliate_url text,
  image_url text,
  seller_name text,
  official_retailer_seller boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  source_provider text,
  source_confidence numeric(4,3) not null default 0.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer, product_url)
);

create table if not exists public.availability_snapshots (
  id uuid primary key default gen_random_uuid(),
  retailer_product_id uuid not null references public.retailer_products(id) on delete cascade,
  status public.stock_status not null default 'unknown',
  price numeric(10,2),
  currency text not null default 'USD',
  availability_type text not null default 'online',
  store_id uuid,
  shipping_available boolean,
  pickup_available boolean,
  delivery_available boolean,
  quantity_hint text,
  seller_name text,
  checked_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  retailer_store_id text not null,
  name text,
  address text,
  city text,
  state text,
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer, retailer_store_id)
);

alter table public.availability_snapshots
  add constraint availability_snapshots_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete set null;

create table if not exists public.retailer_connector_health (
  retailer text primary key,
  state text not null default 'partially_supported',
  success_count integer not null default 0,
  failure_count integer not null default 0,
  consecutive_failures integer not null default 0,
  average_response_ms integer,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.retail_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  retailer text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked_count integer not null default 0,
  changed_count integer not null default 0,
  error_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.product_match_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.catalog_products(id) on delete set null,
  retailer text not null,
  retailer_product_id text,
  title text not null,
  product_url text not null,
  suggested_product_id uuid references public.catalog_products(id) on delete set null,
  confidence numeric(4,3) not null default 0,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete cascade,
  retailer_product_id uuid references public.retailer_products(id) on delete set null,
  event_key text not null,
  status public.stock_status not null,
  price numeric(10,2),
  retailer text,
  availability_type text,
  store_id uuid references public.stores(id) on delete set null,
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (event_key)
);

alter table public.retailer_products enable row level security;
alter table public.availability_snapshots enable row level security;
alter table public.stores enable row level security;
alter table public.retailer_connector_health enable row level security;
alter table public.retail_job_runs enable row level security;
alter table public.product_match_reviews enable row level security;
alter table public.notification_events enable row level security;

create policy "retailer products authenticated select" on public.retailer_products for select using (auth.role() = 'authenticated');
create policy "retailer products admin all" on public.retailer_products for all using (public.is_admin()) with check (public.is_admin());

create policy "availability snapshots authenticated select" on public.availability_snapshots for select using (auth.role() = 'authenticated');
create policy "availability snapshots admin all" on public.availability_snapshots for all using (public.is_admin()) with check (public.is_admin());

create policy "stores authenticated select" on public.stores for select using (auth.role() = 'authenticated');
create policy "stores admin all" on public.stores for all using (public.is_admin()) with check (public.is_admin());

create policy "connector health admin all" on public.retailer_connector_health for all using (public.is_admin()) with check (public.is_admin());
create policy "retail job runs admin all" on public.retail_job_runs for all using (public.is_admin()) with check (public.is_admin());
create policy "product match reviews admin all" on public.product_match_reviews for all using (public.is_admin()) with check (public.is_admin());
create policy "notification events own select" on public.notification_events for select using (auth.uid() = user_id);
create policy "notification events admin all" on public.notification_events for all using (public.is_admin()) with check (public.is_admin());

create index if not exists catalog_products_upc_idx on public.catalog_products(upc);
create index if not exists catalog_products_release_date_idx on public.catalog_products(release_date);
create index if not exists catalog_products_popularity_idx on public.catalog_products(popularity_score desc, tracking_count desc);
create index if not exists retailer_products_product_idx on public.retailer_products(product_id);
create index if not exists retailer_products_retailer_idx on public.retailer_products(retailer);
create index if not exists retailer_products_upc_idx on public.retailer_products(upc);
create index if not exists availability_snapshots_latest_idx on public.availability_snapshots(retailer_product_id, checked_at desc);
create index if not exists availability_snapshots_status_idx on public.availability_snapshots(status, checked_at desc);
create index if not exists product_match_reviews_status_idx on public.product_match_reviews(status, created_at desc);
create index if not exists notification_events_user_sent_idx on public.notification_events(user_id, sent_at desc);
