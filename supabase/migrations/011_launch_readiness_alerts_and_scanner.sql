-- Launch-readiness safety migration for scanner inventory images, default ZIPs,
-- and restock alert dedupe/cooldowns. Safe to rerun.

alter table public.profiles
  add column if not exists postal_code text;

alter table public.inventory_items
  add column if not exists image_url text;

alter table public.product_alerts
  add column if not exists max_price numeric(10,2),
  add column if not exists preferred_retailers text[] not null default '{}'::text[],
  add column if not exists online_only boolean not null default true,
  add column if not exists local_pickup boolean not null default false,
  add column if not exists official_retailer_only boolean not null default true,
  add column if not exists allow_third_party_sellers boolean not null default false,
  add column if not exists cooldown_minutes integer not null default 60;

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
  metadata jsonb not null default '{}'::jsonb
);

alter table public.notification_events enable row level security;

create unique index if not exists notification_events_event_key_idx
  on public.notification_events(event_key);

create index if not exists notification_events_cooldown_idx
  on public.notification_events(user_id, product_id, retailer, availability_type, sent_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_events'
      and policyname = 'notification events own select'
  ) then
    create policy "notification events own select"
      on public.notification_events for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_events'
      and policyname = 'notification events admin all'
  ) then
    create policy "notification events admin all"
      on public.notification_events for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
