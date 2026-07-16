-- Launch operations support: admin-visible app events and offer disabling.

alter table public.catalog_offers
  add column if not exists active boolean not null default true;

create index if not exists catalog_offers_active_idx
  on public.catalog_offers(active);

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  severity text not null default 'info' check (severity in ('info', 'warn', 'error')),
  message text not null,
  user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_events enable row level security;

create index if not exists app_events_category_created_idx
  on public.app_events(category, created_at desc);

create index if not exists app_events_severity_created_idx
  on public.app_events(severity, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_events'
      and policyname = 'app events admin all'
  ) then
    create policy "app events admin all"
      on public.app_events for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
