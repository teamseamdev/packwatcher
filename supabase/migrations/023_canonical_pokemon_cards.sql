create table if not exists public.pokemon_card_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  set_code text,
  release_date date,
  printed_total integer,
  actual_total integer,
  series text,
  symbol_url text,
  logo_url text,
  tcgplayer_group_id integer unique,
  pokemon_tcg_api_set_id text unique,
  tcgdex_set_id text unique,
  language text default 'english',
  source_metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pokemon_cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.pokemon_card_sets(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  collector_number_raw text,
  collector_number_normalized text,
  collector_number_prefix text,
  collector_number_numeric integer,
  collector_number_suffix text,
  denominator_raw text,
  denominator_numeric integer,
  set_sort_key text,
  rarity text,
  supertype text,
  subtypes text[],
  hp text,
  types text[],
  artist text,
  regulation_mark text,
  image_small text,
  image_large text,
  tcgplayer_product_id integer unique,
  pokemon_tcg_api_card_id text unique,
  tcgdex_card_id text unique,
  source_metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(set_id, collector_number_normalized, normalized_name)
);

alter table public.inventory_items
  add column if not exists canonical_set_id uuid references public.pokemon_card_sets(id) on delete set null,
  add column if not exists canonical_card_id uuid references public.pokemon_cards(id) on delete set null,
  add column if not exists condition text default 'near_mint';

create index if not exists pokemon_cards_set_id_idx on public.pokemon_cards(set_id);
create index if not exists pokemon_cards_normalized_name_idx on public.pokemon_cards(normalized_name);
create index if not exists pokemon_cards_set_number_idx on public.pokemon_cards(set_id, collector_number_normalized);
create index if not exists pokemon_cards_set_name_idx on public.pokemon_cards(set_id, normalized_name);
create index if not exists pokemon_cards_sort_idx on public.pokemon_cards(set_id, set_sort_key);
create index if not exists inventory_items_canonical_set_idx on public.inventory_items(user_id, canonical_set_id);
create index if not exists inventory_items_canonical_card_idx on public.inventory_items(user_id, canonical_card_id);

alter table public.pokemon_card_sets enable row level security;
alter table public.pokemon_cards enable row level security;

drop policy if exists "Pokemon card sets are readable" on public.pokemon_card_sets;
create policy "Pokemon card sets are readable"
  on public.pokemon_card_sets
  for select
  to authenticated
  using (true);

drop policy if exists "Pokemon cards are readable" on public.pokemon_cards;
create policy "Pokemon cards are readable"
  on public.pokemon_cards
  for select
  to authenticated
  using (true);
