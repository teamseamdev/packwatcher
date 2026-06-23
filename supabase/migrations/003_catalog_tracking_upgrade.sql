-- Upgrades catalog rows so products can exist even before retailer offers are known.

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
  title = coalesce(title, name),
  source_id = coalesce(source_id, source_product_id),
  product_type = coalesce(product_type, category),
  brand = coalesce(brand, 'Pokemon')
where title is null
   or source_id is null
   or product_type is null
   or brand is null;

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
  product_id = coalesce(product_id, catalog_product_id),
  retailer = coalesce(retailer, store_name),
  price = coalesce(price, last_price),
  in_stock = coalesce(in_stock, status = 'in_stock'),
  availability_text = coalesce(availability_text, replace(status::text, '_', ' '))
where product_id is null
   or retailer is null
   or price is null
   or in_stock is null
   or availability_text is null;

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
