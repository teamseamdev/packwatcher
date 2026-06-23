-- Run this on an existing PackWatcher Supabase project.
-- It only adds the shared catalog tables/policies needed for URL-less tracking.

create extension if not exists "pgcrypto";

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  source text,
  source_product_id text,
  name text not null,
  tcg text not null default 'pokemon',
  category text,
  set_name text,
  image_url text,
  msrp numeric(10,2),
  created_at timestamptz not null default now()
);

alter table public.catalog_products add column if not exists source text;
alter table public.catalog_products add column if not exists source_product_id text;

create table if not exists public.catalog_offers (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid not null references public.catalog_products(id) on delete cascade,
  store_name text not null,
  url text not null,
  status public.stock_status not null default 'unknown',
  last_price numeric(10,2),
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_offers_catalog_product_id_store_name_url_key'
  ) then
    alter table public.catalog_offers
      add constraint catalog_offers_catalog_product_id_store_name_url_key
      unique (catalog_product_id, store_name, url);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_products_source_source_product_id_key'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_source_source_product_id_key
      unique (source, source_product_id);
  end if;
end $$;

alter table public.catalog_products enable row level security;
alter table public.catalog_offers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'catalog_products'
    and policyname = 'catalog products authenticated select'
  ) then
    create policy "catalog products authenticated select"
      on public.catalog_products
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'catalog_products'
    and policyname = 'catalog products admin all'
  ) then
    create policy "catalog products admin all"
      on public.catalog_products
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'catalog_offers'
    and policyname = 'catalog offers authenticated select'
  ) then
    create policy "catalog offers authenticated select"
      on public.catalog_offers
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'catalog_offers'
    and policyname = 'catalog offers admin all'
  ) then
    create policy "catalog offers admin all"
      on public.catalog_offers
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

create index if not exists catalog_products_search_idx
  on public.catalog_products
  using gin (to_tsvector('english', name || ' ' || coalesce(set_name, '') || ' ' || coalesce(category, '') || ' ' || tcg));

create index if not exists catalog_offers_product_id_idx
  on public.catalog_offers(catalog_product_id);

create index if not exists catalog_offers_status_idx
  on public.catalog_offers(status);
