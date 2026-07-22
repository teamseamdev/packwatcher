create table if not exists public.ebay_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null unique,
  return_path text not null default '/account?section=ebay',
  environment text not null default 'production',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ebay_oauth_states enable row level security;

drop policy if exists "ebay oauth states admin all" on public.ebay_oauth_states;
create policy "ebay oauth states admin all" on public.ebay_oauth_states
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.ebay_connections
  add column if not exists marketplace_id text not null default 'EBAY_US',
  add column if not exists access_token_encrypted text,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists status text not null default 'connected',
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists last_error text;

create index if not exists ebay_oauth_states_user_created_idx on public.ebay_oauth_states(user_id, created_at desc);
create index if not exists ebay_oauth_states_expires_idx on public.ebay_oauth_states(expires_at);
create index if not exists ebay_connections_status_idx on public.ebay_connections(status);
