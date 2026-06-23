-- Upgrades catalog rows so products can exist even before retailer offers are known.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'stock_status'
  ) then
    create type public.stock_status as enum ('unknown', 'in_stock', 'out_of_stock');
  end if;
end $$;

-- Keep the legacy columns used by the current importer. Some PackWatcher
-- databases were created from an earlier catalog schema and do not have them.
alter table public.catalog_products add column if not exists source text;
alter table public.catalog_products add column if not exists source_product_id text;
alter table public.catalog_products add column if not exists name text;
alter table public.catalog_products add column if not exists tcg text default 'pokemon';
alter table public.catalog_products add column if not exists category text;
alter table public.catalog_products add column if not exists set_name text;
alter table public.catalog_products add column if not exists image_url text;
alter table public.catalog_products add column if not exists msrp numeric(10,2);
alter table public.catalog_products add column if not exists slug text;
alter table public.catalog_products add column if not exists title text;
alter table public.catalog_products add column if not exists brand text default 'Pokemon';
alter table public.catalog_products add column if not exists series_name text;
alter table public.catalog_products add column if not exists product_type text;
alter table public.catalog_products add column if not exists source_id text;
alter table public.catalog_products add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.catalog_products add column if not exists updated_at timestamptz not null default now();

update public.catalog_products
set
  name = coalesce(name, title),
  title = coalesce(title, name),
  source_product_id = coalesce(source_product_id, source_id),
  source_id = coalesce(source_id, source_product_id),
  product_type = coalesce(product_type, category),
  category = coalesce(category, product_type),
  tcg = coalesce(tcg, 'pokemon'),
  brand = coalesce(brand, 'Pokemon')
where name is null
   or title is null
   or source_product_id is null
   or source_id is null
   or product_type is null
   or category is null
   or tcg is null
   or brand is null;

alter table public.catalog_offers add column if not exists catalog_product_id uuid references public.catalog_products(id) on delete cascade;
alter table public.catalog_offers add column if not exists store_name text;
alter table public.catalog_offers add column if not exists url text;
alter table public.catalog_offers add column if not exists status public.stock_status default 'unknown';
alter table public.catalog_offers add column if not exists last_price numeric(10,2);
alter table public.catalog_offers add column if not exists last_checked_at timestamptz;
alter table public.catalog_offers add column if not exists product_id uuid references public.catalog_products(id) on delete cascade;
alter table public.catalog_offers add column if not exists retailer text;
alter table public.catalog_offers add column if not exists retailer_product_id text;
alter table public.catalog_offers add column if not exists title text;
alter table public.catalog_offers add column if not exists price numeric(10,2);
alter table public.catalog_offers add column if not exists currency text not null default 'USD';
alter table public.catalog_offers add column if not exists image_url text;
alter table public.catalog_offers add column if not exists in_stock boolean;
alter table public.catalog_offers add column if not exists availability_text text;
alter table public.catalog_offers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.catalog_offers add column if not exists updated_at timestamptz not null default now();

update public.catalog_offers
set
  catalog_product_id = coalesce(catalog_product_id, product_id),
  product_id = coalesce(product_id, catalog_product_id),
  store_name = coalesce(store_name, retailer),
  retailer = coalesce(retailer, store_name),
  last_price = coalesce(last_price, price),
  price = coalesce(price, last_price),
  status = case
    when status is null or status = 'unknown'::public.stock_status then
      case
        when in_stock is true then 'in_stock'::public.stock_status
        when in_stock is false then 'out_of_stock'::public.stock_status
        else 'unknown'::public.stock_status
      end
    else status
  end,
  in_stock = coalesce(in_stock, status = 'in_stock'),
  availability_text = coalesce(availability_text, replace(status::text, '_', ' '))
where catalog_product_id is null
   or product_id is null
   or store_name is null
   or retailer is null
   or last_price is null
   or price is null
   or status is null
   or in_stock is null
   or availability_text is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.catalog_products'::regclass
      and conname = 'catalog_products_source_source_product_id_key'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_source_source_product_id_key
      unique (source, source_product_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.catalog_offers'::regclass
      and conname = 'catalog_offers_catalog_product_id_store_name_url_key'
  ) then
    alter table public.catalog_offers
      add constraint catalog_offers_catalog_product_id_store_name_url_key
      unique (catalog_product_id, store_name, url);
  end if;
end $$;

create table if not exists public.product_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  notify_push boolean not null default true,
  notify_email boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.product_alerts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'product_alerts'
    and policyname = 'product alerts own all'
  ) then
    create policy "product alerts own all"
      on public.product_alerts
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists catalog_products_slug_idx on public.catalog_products(slug);
create index if not exists catalog_products_source_id_idx on public.catalog_products(source, source_id);
create index if not exists catalog_offers_product_id_new_idx on public.catalog_offers(product_id);
create index if not exists catalog_offers_in_stock_idx on public.catalog_offers(in_stock);
create index if not exists product_alerts_user_id_idx on public.product_alerts(user_id);
create index if not exists product_alerts_product_id_idx on public.product_alerts(product_id);
