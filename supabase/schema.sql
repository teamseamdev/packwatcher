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

create index tracked_products_user_id_idx on public.tracked_products(user_id);
create index stock_checks_product_id_checked_idx on public.stock_checks(tracked_product_id, checked_at desc);
create index notifications_user_id_created_idx on public.notifications(user_id, created_at desc);
create index inventory_items_user_id_idx on public.inventory_items(user_id);
