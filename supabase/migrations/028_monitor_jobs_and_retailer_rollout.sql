-- Monitor job leasing function and retailer rollout metadata.

create table if not exists public.retailer_rollout (
  retailer text primary key,
  display_name text not null,
  tier integer not null default 3,
  support_state text not null default 'not_supported',
  acquisition_method text not null default 'not_integrated',
  public_enabled boolean not null default false,
  product_discovery boolean not null default false,
  online_inventory boolean not null default false,
  local_inventory boolean not null default false,
  price_tracking boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.retailer_rollout enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'retailer_rollout' and policyname = 'retailer rollout authenticated select') then
    create policy "retailer rollout authenticated select" on public.retailer_rollout for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'retailer_rollout' and policyname = 'retailer rollout admin all') then
    create policy "retailer rollout admin all" on public.retailer_rollout for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

insert into public.retailer_rollout (retailer, display_name, tier, support_state, acquisition_method, public_enabled, product_discovery, online_inventory, local_inventory, price_tracking, notes)
values
  ('bestbuy', 'Best Buy', 1, 'connected', 'official_public_api', true, true, true, false, true, 'Uses configured Best Buy API key for import and public product-page checks for monitoring.'),
  ('pokemon-center', 'Pokemon Center', 1, 'partially_supported', 'permitted_page_monitoring', true, false, true, false, true, 'Online product-page monitor only.'),
  ('target', 'Target', 1, 'partially_supported', 'public_search_and_page_monitoring', true, true, true, false, true, 'Search discovery can be enabled; local inventory not claimed.'),
  ('walmart', 'Walmart', 1, 'partially_supported', 'public_search_and_page_monitoring', true, true, true, false, true, 'Search discovery can be enabled; marketplace seller caution applies.'),
  ('gamestop', 'GameStop', 1, 'partially_supported', 'public_search_and_page_monitoring', true, true, true, false, true, 'Search discovery can be enabled; may return HTTP 403 when blocked.'),
  ('amazon', 'Amazon', 1, 'partially_supported', 'permitted_page_monitoring', true, false, true, false, true, 'Online page monitor only; marketplace sellers are labeled by source metadata when available.'),
  ('costco', 'Costco', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('sams-club', 'Sam''s Club', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('barnes-noble', 'Barnes & Noble', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('macys', 'Macy''s', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('meijer', 'Meijer', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('bjs', 'BJ''s Wholesale Club', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('scheels', 'Scheels', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('walgreens', 'Walgreens', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('cvs', 'CVS', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('dollar-general', 'Dollar General', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('family-dollar', 'Family Dollar', 2, 'not_supported', 'not_integrated', false, false, false, false, false, 'Adapter not publicly enabled.'),
  ('five-below', 'Five Below', 2, 'partially_supported', 'shopping_search_discovery', false, true, false, false, false, 'Can appear through shopping-search discovery; not treated as verified inventory.'),
  ('regional-lgs', 'Regional/local game stores', 3, 'not_supported', 'manual_feed', false, false, false, false, false, 'Planned feed/manual partner model.'),
  ('hobby-shops', 'Approved hobby shops', 3, 'not_supported', 'manual_feed', false, false, false, false, false, 'Planned feed/manual partner model.')
on conflict (retailer) do update set
  display_name = excluded.display_name,
  tier = excluded.tier,
  support_state = excluded.support_state,
  acquisition_method = excluded.acquisition_method,
  public_enabled = excluded.public_enabled,
  product_discovery = excluded.product_discovery,
  online_inventory = excluded.online_inventory,
  local_inventory = excluded.local_inventory,
  price_tracking = excluded.price_tracking,
  notes = excluded.notes,
  updated_at = now();

create or replace function public.claim_monitor_jobs(
  p_worker text,
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns setof public.monitor_jobs
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.monitor_jobs
    where status in ('queued', 'retry')
      and scheduled_at <= now()
      and (lease_expires_at is null or lease_expires_at < now())
    order by priority desc, scheduled_at asc
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ),
  claimed as (
    update public.monitor_jobs job
    set status = 'leased',
        lease_owner = p_worker,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from due
    where job.id = due.id
    returning job.*
  )
  select * from claimed;
$$;

grant execute on function public.claim_monitor_jobs(text, integer, integer) to service_role;

drop index if exists public.monitor_jobs_catalog_offer_unique_idx;

create unique index if not exists monitor_jobs_catalog_offer_unique_idx
  on public.monitor_jobs(catalog_offer_id);
