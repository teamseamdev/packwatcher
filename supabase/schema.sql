create extension if not exists "pgcrypto";

create type public.plan_type as enum ('free', 'pro', 'admin');
create type public.stock_status as enum ('unknown', 'in_stock', 'out_of_stock');
create type public.promo_discount_type as enum ('percent', 'amount');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  avatar_url text,
  postal_code text,
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
  image_url text,
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

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type public.promo_discount_type not null,
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
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

create table public.clip_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  product_name text not null,
  total_cost numeric(10,2) not null default 0,
  pack_count integer not null default 1,
  notes text,
  source_video_url text,
  source_video_path text not null,
  source_video_bucket text not null default 'clip-source-videos',
  source_file_name text,
  source_content_type text,
  source_file_size bigint,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'needs_review', 'ready_to_export', 'exporting', 'complete', 'failed')),
  analysis_mode text not null default 'manual' check (analysis_mode in ('manual', 'local_assist', 'ai_assist')),
  total_pull_value numeric(10,2) not null default 0,
  profit_loss numeric(10,2) not null default 0,
  roi_percent numeric(10,2) not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clip_moments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.clip_projects(id) on delete cascade,
  timestamp_start numeric(10,2) not null default 0,
  timestamp_end numeric(10,2) not null default 0,
  moment_type text not null default 'manual',
  confidence numeric(4,3) not null default 0,
  thumbnail_url text,
  thumbnail_path text,
  thumbnail_bucket text,
  include_in_export boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.clip_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.clip_projects(id) on delete cascade,
  moment_id uuid references public.clip_moments(id) on delete cascade,
  card_name text not null default '',
  set_name text,
  card_number text,
  variant text,
  estimated_value numeric(10,2) not null default 0,
  confidence numeric(4,3) not null default 0,
  pricing_source text not null default 'manual',
  recognition_source text not null default 'manual',
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clip_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.clip_projects(id) on delete cascade,
  export_url text,
  export_path text not null,
  export_bucket text not null default 'clip-exports',
  format text not null default 'mp4',
  duration numeric(10,2),
  resolution text not null default '1080x1920',
  status text not null default 'complete',
  created_at timestamptz not null default now()
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

create or replace function public.redeem_promo_code(
  input_promo_code_id uuid,
  input_user_id uuid,
  input_checkout_session_id text,
  input_subscription_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.promo_code_redemptions (
    promo_code_id,
    user_id,
    stripe_checkout_session_id,
    stripe_subscription_id
  )
  values (
    input_promo_code_id,
    input_user_id,
    input_checkout_session_id,
    input_subscription_id
  )
  on conflict (stripe_checkout_session_id) do nothing;

  if found then
    update public.promo_codes
    set used_count = used_count + 1,
        updated_at = now()
    where id = input_promo_code_id;
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.tracked_products enable row level security;
alter table public.stock_checks enable row level security;
alter table public.notifications enable row level security;
alter table public.inventory_items enable row level security;
alter table public.billing_status enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_code_redemptions enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_offers enable row level security;
alter table public.product_alerts enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.clip_projects enable row level security;
alter table public.clip_moments enable row level security;
alter table public.clip_cards enable row level security;
alter table public.clip_exports enable row level security;

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

create policy "promo codes admin all" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());
create policy "promo redemptions admin select" on public.promo_code_redemptions for select using (public.is_admin());
create policy "promo redemptions own select" on public.promo_code_redemptions for select using (auth.uid() = user_id);

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

create policy "clip projects own all" on public.clip_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "clip moments own all" on public.clip_moments
  for all using (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_moments.project_id
      and clip_projects.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_moments.project_id
      and clip_projects.user_id = auth.uid()
    )
  );

create policy "clip cards own all" on public.clip_cards
  for all using (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_cards.project_id
      and clip_projects.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_cards.project_id
      and clip_projects.user_id = auth.uid()
    )
  );

create policy "clip exports own all" on public.clip_exports
  for all using (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_exports.project_id
      and clip_projects.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_exports.project_id
      and clip_projects.user_id = auth.uid()
    )
  );

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
create index clip_projects_user_created_idx on public.clip_projects(user_id, created_at desc);
create index clip_moments_project_order_idx on public.clip_moments(project_id, sort_order);
create index clip_cards_project_idx on public.clip_cards(project_id);
create index clip_cards_moment_idx on public.clip_cards(moment_id);
create index clip_exports_project_created_idx on public.clip_exports(project_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('clip-source-videos', 'clip-source-videos', false, 5368709120, array['video/mp4', 'video/quicktime', 'video/webm']),
  ('clip-thumbnails', 'clip-thumbnails', false, 52428800, array['image/jpeg']),
  ('clip-exports', 'clip-exports', false, 5368709120, array['video/mp4'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "clip source videos user object access" on storage.objects
  for all using (
    bucket_id = 'clip-source-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'clip-source-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "clip thumbnails user object access" on storage.objects
  for all using (
    bucket_id = 'clip-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'clip-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "clip exports user object access" on storage.objects
  for all using (
    bucket_id = 'clip-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'clip-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
