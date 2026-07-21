-- Durable tracking pipeline foundation for normalized retailer observations,
-- reduced latest state, immutable restock events, and notification outbox jobs.
-- This migration is additive and safe to rerun.

alter type public.stock_status add value if not exists 'coming_soon';
alter type public.stock_status add value if not exists 'pickup_only';
alter type public.stock_status add value if not exists 'shipping_only';
alter type public.stock_status add value if not exists 'delivery_only';
alter type public.stock_status add value if not exists 'unavailable_at_location';
alter type public.stock_status add value if not exists 'listing_removed';
alter type public.stock_status add value if not exists 'blocked';
alter type public.stock_status add value if not exists 'error';

create table if not exists public.availability_observations (
  id uuid primary key default gen_random_uuid(),
  catalog_offer_id uuid references public.catalog_offers(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete cascade,
  retailer text not null,
  store_id uuid references public.stores(id) on delete set null,
  previous_status public.stock_status,
  status public.stock_status not null default 'unknown',
  price numeric(10,2),
  regular_price numeric(10,2),
  sale_price numeric(10,2),
  currency text not null default 'USD',
  availability_type text not null default 'online',
  shipping_available boolean,
  pickup_available boolean,
  delivery_available boolean,
  quantity_hint text,
  seller_name text,
  official_retailer_seller boolean not null default true,
  confidence numeric(4,3) not null default 0.5,
  evidence_hash text not null,
  source_status text,
  extraction_strategy text,
  adapter_version text,
  checked_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_latest_state (
  catalog_offer_id uuid primary key references public.catalog_offers(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete cascade,
  retailer text not null,
  store_id uuid references public.stores(id) on delete set null,
  previous_status public.stock_status,
  status public.stock_status not null default 'unknown',
  price numeric(10,2),
  currency text not null default 'USD',
  availability_type text not null default 'online',
  in_stock boolean not null default false,
  confidence numeric(4,3) not null default 0.5,
  last_observation_id uuid references public.availability_observations(id) on delete set null,
  last_checked_at timestamptz,
  state_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.restock_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  catalog_offer_id uuid references public.catalog_offers(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  previous_status public.stock_status,
  new_status public.stock_status not null,
  price numeric(10,2),
  seller_name text,
  observed_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 0.5,
  trigger_observation_ids uuid[] not null default '{}'::uuid[],
  notification_status text not null default 'pending',
  event_source text not null default 'retailer_check',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  restock_event_id uuid references public.restock_events(id) on delete cascade,
  channel text not null default 'web_push',
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  provider_response jsonb,
  error_message text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitor_jobs (
  id uuid primary key default gen_random_uuid(),
  catalog_offer_id uuid references public.catalog_offers(id) on delete cascade,
  retailer text not null,
  priority integer not null default 50,
  scheduled_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  status text not null default 'queued',
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.availability_observations enable row level security;
alter table public.listing_latest_state enable row level security;
alter table public.restock_events enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.monitor_jobs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'availability_observations' and policyname = 'availability observations authenticated select') then
    create policy "availability observations authenticated select" on public.availability_observations for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'availability_observations' and policyname = 'availability observations admin all') then
    create policy "availability observations admin all" on public.availability_observations for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_latest_state' and policyname = 'listing latest authenticated select') then
    create policy "listing latest authenticated select" on public.listing_latest_state for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_latest_state' and policyname = 'listing latest admin all') then
    create policy "listing latest admin all" on public.listing_latest_state for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'restock_events' and policyname = 'restock events authenticated select') then
    create policy "restock events authenticated select" on public.restock_events for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'restock_events' and policyname = 'restock events admin all') then
    create policy "restock events admin all" on public.restock_events for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_outbox' and policyname = 'notification outbox own select') then
    create policy "notification outbox own select" on public.notification_outbox for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_outbox' and policyname = 'notification outbox admin all') then
    create policy "notification outbox admin all" on public.notification_outbox for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'monitor_jobs' and policyname = 'monitor jobs admin all') then
    create policy "monitor jobs admin all" on public.monitor_jobs for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

create index if not exists availability_observations_offer_checked_idx on public.availability_observations(catalog_offer_id, checked_at desc);
create index if not exists availability_observations_product_status_idx on public.availability_observations(product_id, status, checked_at desc);
create index if not exists availability_observations_test_idx on public.availability_observations(is_test, checked_at desc);
create index if not exists listing_latest_product_status_idx on public.listing_latest_state(product_id, status, last_checked_at desc);
create index if not exists restock_events_product_created_idx on public.restock_events(product_id, created_at desc);
create index if not exists restock_events_test_idx on public.restock_events(is_test, created_at desc);
create index if not exists notification_outbox_pending_idx on public.notification_outbox(status, available_at, created_at);
create index if not exists notification_outbox_user_idx on public.notification_outbox(user_id, created_at desc);
create index if not exists monitor_jobs_due_idx on public.monitor_jobs(status, scheduled_at, priority desc);
create index if not exists monitor_jobs_offer_idx on public.monitor_jobs(catalog_offer_id, scheduled_at desc);
