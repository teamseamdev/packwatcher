alter table public.inventory_items
  add column if not exists card_name text,
  add column if not exists set_name text,
  add column if not exists card_number text,
  add column if not exists variant text,
  add column if not exists foil boolean not null default false,
  add column if not exists language text;

update public.inventory_items
set
  card_name = coalesce(card_name, nullif(trim(split_part(name, ' - ', 1)), '')),
  card_number = coalesce(card_number, nullif(substring(name from '([0-9]{1,4}\s*/\s*[0-9]{1,4})'), '')),
  set_name = coalesce(
    set_name,
    nullif(trim(regexp_replace(name, '^.*? - .*? - ', '')), name),
    nullif(substring(notes from 'Set: ([^\n]+)'), '')
  ),
  variant = coalesce(variant, nullif(substring(notes from 'Variant: ([^\n]+)'), '')),
  foil = foil or notes ~* '(foil|holo|reverse holo)' or name ~* '(foil|holo|reverse holo)'
where card_name is null
   or card_number is null
   or set_name is null
   or variant is null;

create index if not exists inventory_items_user_set_idx on public.inventory_items(user_id, set_name);
create index if not exists inventory_items_user_card_number_idx on public.inventory_items(user_id, card_number);
