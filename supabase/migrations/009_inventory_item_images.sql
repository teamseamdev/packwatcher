alter table public.inventory_items
  add column if not exists image_url text;
