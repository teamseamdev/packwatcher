create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'suggestion' check (type in ('suggestion', 'bug', 'issue', 'other')),
  status text not null default 'new' check (status in ('new', 'reviewed', 'in_progress', 'handled', 'closed')),
  title text not null check (char_length(title) <= 140),
  message text not null check (char_length(message) <= 2000),
  page_url text,
  browser_info text,
  status_note text,
  status_changed_by uuid references public.profiles(id) on delete set null,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_status_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  admin_user_id uuid references public.profiles(id) on delete set null,
  previous_status text check (previous_status in ('new', 'reviewed', 'in_progress', 'handled', 'closed')),
  next_status text not null check (next_status in ('new', 'reviewed', 'in_progress', 'handled', 'closed')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_items_user_created_idx on public.feedback_items(user_id, created_at desc);
create index if not exists feedback_items_status_created_idx on public.feedback_items(status, created_at desc);
create index if not exists feedback_status_events_feedback_created_idx on public.feedback_status_events(feedback_id, created_at desc);

alter table public.feedback_items enable row level security;
alter table public.feedback_status_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_items'
      and policyname = 'feedback items own insert'
  ) then
    create policy "feedback items own insert"
      on public.feedback_items
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_items'
      and policyname = 'feedback items own select'
  ) then
    create policy "feedback items own select"
      on public.feedback_items
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_items'
      and policyname = 'feedback items admin all'
  ) then
    create policy "feedback items admin all"
      on public.feedback_items
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_status_events'
      and policyname = 'feedback status events own select'
  ) then
    create policy "feedback status events own select"
      on public.feedback_status_events
      for select
      using (
        exists (
          select 1
          from public.feedback_items
          where feedback_items.id = feedback_status_events.feedback_id
            and feedback_items.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_status_events'
      and policyname = 'feedback status events admin all'
  ) then
    create policy "feedback status events admin all"
      on public.feedback_status_events
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
