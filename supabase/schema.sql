create extension if not exists "pgcrypto";

create type public.plan_type as enum ('free', 'pro', 'admin');
create type public.stock_status as enum ('unknown', 'in_stock', 'out_of_stock');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  avatar_url text,
  plan public.plan_type not null default 'free',
  created_at timestamptz not null default now()
);

create table public.tracked_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  store_name text not null,
  url text not null,
  image_url text,
  category text,
  set_name text,
  msrp numeric(10,2),
  target_price numeric(10,2),
  status public.stock_status not null default 'unknown',
  last_price numeric(10,2),
  last_checked_at timestamptz,
  alerts_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table public.stock_checks (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references public.tracked_products(id) on delete cascade,
  status public.stock_status not null,
  price numeric(10,2),
  raw_match_reason text,
  checked_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tracked_product_id uuid references public.tracked_products(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  purchase_price numeric(10,2) not null default 0,
  purchase_date date,
  estimated_sale_price numeric(10,2) not null default 0,
  fees numeric(10,2) not null default 0,
  shipping numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.billing_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  plan public.plan_type not null default 'free'
);

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  source text,
  source_product_id text,
  source_id text,
  slug text,
  name text not null,
  title text,
  brand text default 'Pokemon',
  tcg text not null default 'pokemon',
  category text,
  set_name text,
  series_name text,
  product_type text,
  image_url text,
  msrp numeric(10,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_product_id)
);

create table public.catalog_offers (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid not null references public.catalog_products(id) on delete cascade,
  product_id uuid references public.catalog_products(id) on delete cascade,
  store_name text not null,
  retailer text,
  retailer_product_id text,
  title text,
  url text not null,
  status public.stock_status not null default 'unknown',
  last_price numeric(10,2),
  price numeric(10,2),
  currency text not null default 'USD',
  image_url text,
  in_stock boolean,
  availability_text text,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_product_id, store_name, url)
);

create table public.product_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  notify_push boolean not null default true,
  notify_email boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  insert into public.billing_status (user_id, plan)
  values (new.id, 'free');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
    and plan = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.tracked_products enable row level security;
alter table public.stock_checks enable row level security;
alter table public.notifications enable row level security;
alter table public.inventory_items enable row level security;
alter table public.billing_status enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_offers enable row level security;
alter table public.product_alerts enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles admin select" on public.profiles for select using (public.is_admin());
create policy "profiles admin update" on public.profiles for update using (public.is_admin());

create policy "tracked products own all" on public.tracked_products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tracked products admin select" on public.tracked_products for select using (public.is_admin());

create policy "stock checks own select" on public.stock_checks
  for select using (
    exists (
      select 1 from public.tracked_products
      where tracked_products.id = stock_checks.tracked_product_id
      and tracked_products.user_id = auth.uid()
    )
  );
create policy "stock checks admin select" on public.stock_checks for select using (public.is_admin());

create policy "notifications own all" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications admin select" on public.notifications for select using (public.is_admin());

create policy "inventory own all" on public.inventory_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "inventory admin select" on public.inventory_items for select using (public.is_admin());

create policy "billing own select" on public.billing_status for select using (auth.uid() = user_id);
create policy "billing admin select" on public.billing_status for select using (public.is_admin());

create policy "catalog products authenticated select" on public.catalog_products for select using (auth.role() = 'authenticated');
create policy "catalog products admin all" on public.catalog_products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "catalog offers authenticated select" on public.catalog_offers for select using (auth.role() = 'authenticated');
create policy "catalog offers admin all" on public.catalog_offers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "product alerts own all" on public.product_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push subscriptions own all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index tracked_products_user_id_idx on public.tracked_products(user_id);
create index stock_checks_product_id_checked_idx on public.stock_checks(tracked_product_id, checked_at desc);
create index notifications_user_id_created_idx on public.notifications(user_id, created_at desc);
create index inventory_items_user_id_idx on public.inventory_items(user_id);
create index catalog_products_search_idx on public.catalog_products using gin (to_tsvector('english', name || ' ' || coalesce(set_name, '') || ' ' || coalesce(category, '') || ' ' || tcg));
create index catalog_offers_product_id_idx on public.catalog_offers(catalog_product_id);
create index catalog_offers_status_idx on public.catalog_offers(status);
create index catalog_products_slug_idx on public.catalog_products(slug);
create index catalog_products_source_id_idx on public.catalog_products(source, source_id);
create index catalog_offers_product_id_new_idx on public.catalog_offers(product_id);
create index catalog_offers_in_stock_idx on public.catalog_offers(in_stock);
create index product_alerts_user_id_idx on public.product_alerts(user_id);
create index product_alerts_product_id_idx on public.product_alerts(product_id);
create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
