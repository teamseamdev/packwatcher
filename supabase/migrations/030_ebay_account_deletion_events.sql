create table if not exists public.ebay_account_deletion_events (
  id uuid primary key default gen_random_uuid(),
  notification_id text not null unique,
  ebay_user_id text,
  event_date timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'processed_no_match', 'duplicate', 'failed')),
  error_message text
);

alter table public.ebay_account_deletion_events enable row level security;

drop policy if exists "ebay account deletion events admin select" on public.ebay_account_deletion_events;
create policy "ebay account deletion events admin select" on public.ebay_account_deletion_events
  for select using (public.is_admin());

create index if not exists ebay_account_deletion_events_received_idx on public.ebay_account_deletion_events(received_at desc);
create index if not exists ebay_account_deletion_events_ebay_user_idx on public.ebay_account_deletion_events(ebay_user_id);
