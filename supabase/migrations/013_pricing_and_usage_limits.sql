-- Pricing update: Founder plan and rolling 30-day usage tracking.

alter type public.plan_type add value if not exists 'founder';

create table if not exists public.app_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_kind text not null check (usage_kind in ('card_scan', 'video_scan')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_usage_events enable row level security;

create index if not exists app_usage_events_user_kind_created_idx
  on public.app_usage_events(user_id, usage_kind, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_usage_events'
      and policyname = 'usage events own select'
  ) then
    create policy "usage events own select"
      on public.app_usage_events for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_usage_events'
      and policyname = 'usage events admin all'
  ) then
    create policy "usage events admin all"
      on public.app_usage_events for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
