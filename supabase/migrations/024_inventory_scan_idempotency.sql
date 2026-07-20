alter table public.inventory_items
  add column if not exists scan_event_id text;

create unique index if not exists inventory_items_scan_event_id_unique_idx
  on public.inventory_items(scan_event_id)
  where scan_event_id is not null;
