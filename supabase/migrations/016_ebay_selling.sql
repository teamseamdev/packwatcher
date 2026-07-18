create table if not exists public.ebay_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ebay_user_id text,
  ebay_username text,
  environment text not null default 'production',
  refresh_token_encrypted text not null,
  token_scope text,
  refresh_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ebay_listing_defaults (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  marketplace_id text not null default 'EBAY_US',
  category_id text not null default '183454',
  merchant_location_key text,
  payment_policy_id text,
  return_policy_id text,
  fulfillment_policy_id text,
  condition text not null default 'USED_EXCELLENT',
  currency text not null default 'USD',
  listing_duration text not null default 'GTC',
  updated_at timestamptz not null default now()
);

create table if not exists public.ebay_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  sku text not null,
  offer_id text,
  listing_id text,
  listing_url text,
  status text not null default 'draft',
  title text not null,
  price numeric(10,2) not null default 0,
  quantity integer not null default 1,
  payload jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ebay_connections enable row level security;
alter table public.ebay_listing_defaults enable row level security;
alter table public.ebay_listings enable row level security;

drop policy if exists "ebay connections admin all" on public.ebay_connections;
create policy "ebay connections admin all" on public.ebay_connections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ebay listing defaults own all" on public.ebay_listing_defaults;
create policy "ebay listing defaults own all" on public.ebay_listing_defaults
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ebay listing defaults admin select" on public.ebay_listing_defaults;
create policy "ebay listing defaults admin select" on public.ebay_listing_defaults
  for select using (public.is_admin());

drop policy if exists "ebay listings own all" on public.ebay_listings;
create policy "ebay listings own all" on public.ebay_listings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ebay listings admin select" on public.ebay_listings;
create policy "ebay listings admin select" on public.ebay_listings
  for select using (public.is_admin());

create index if not exists ebay_listings_user_id_idx on public.ebay_listings(user_id);
create index if not exists ebay_listings_inventory_item_id_idx on public.ebay_listings(inventory_item_id);
create index if not exists ebay_listings_listing_id_idx on public.ebay_listings(listing_id);
