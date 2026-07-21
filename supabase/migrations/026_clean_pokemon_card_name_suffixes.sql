create table if not exists public.pokemon_card_name_reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.pokemon_cards(id) on delete cascade,
  old_name text not null,
  new_name text not null,
  collector_number text,
  source text,
  auto_fixed boolean not null default false,
  manual_review_required boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.pokemon_card_name_reconciliation_reports enable row level security;

drop policy if exists "Admins can read card name reconciliation reports" on public.pokemon_card_name_reconciliation_reports;
create policy "Admins can read card name reconciliation reports"
  on public.pokemon_card_name_reconciliation_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.plan = 'admin'
    )
  );

with parsed as (
  select
    id,
    name as old_name,
    collector_number_normalized,
    coalesce(source_metadata->>'source', source_metadata->>'sourceNameRaw', 'unknown') as source,
    nullif(ltrim(regexp_replace(split_part(collector_number_normalized, '/', 1), '[^0-9]', '', 'g'), '0'), '') as numerator_digits,
    nullif(ltrim(regexp_replace(split_part(collector_number_normalized, '/', 2), '[^0-9]', '', 'g'), '0'), '') as denominator_digits
  from public.pokemon_cards
  where collector_number_normalized is not null
    and collector_number_normalized like '%/%'
),
fixes as (
  select
    id,
    old_name,
    collector_number_normalized,
    source,
    trim(regexp_replace(
      old_name,
      '\s+0*' || numerator_digits || '\s*(/|\s)\s*0*' || denominator_digits || '\s*$',
      '',
      'i'
    )) as new_name
  from parsed
  where numerator_digits is not null
    and denominator_digits is not null
    and old_name ~* ('\s+0*' || numerator_digits || '\s*(/|\s)\s*0*' || denominator_digits || '\s*$')
),
valid_fixes as (
  select *
  from fixes
  where new_name <> ''
    and new_name <> old_name
)
insert into public.pokemon_card_name_reconciliation_reports (
  card_id,
  old_name,
  new_name,
  collector_number,
  source,
  auto_fixed,
  manual_review_required
)
select
  id,
  old_name,
  new_name,
  collector_number_normalized,
  source,
  true,
  false
from valid_fixes
where not exists (
  select 1
  from public.pokemon_card_name_reconciliation_reports existing
  where existing.card_id = valid_fixes.id
    and existing.old_name = valid_fixes.old_name
    and existing.new_name = valid_fixes.new_name
);

with parsed as (
  select
    id,
    name as old_name,
    collector_number_normalized,
    nullif(ltrim(regexp_replace(split_part(collector_number_normalized, '/', 1), '[^0-9]', '', 'g'), '0'), '') as numerator_digits,
    nullif(ltrim(regexp_replace(split_part(collector_number_normalized, '/', 2), '[^0-9]', '', 'g'), '0'), '') as denominator_digits
  from public.pokemon_cards
  where collector_number_normalized is not null
    and collector_number_normalized like '%/%'
),
fixes as (
  select
    id,
    old_name,
    trim(regexp_replace(
      old_name,
      '\s+0*' || numerator_digits || '\s*(/|\s)\s*0*' || denominator_digits || '\s*$',
      '',
      'i'
    )) as new_name
  from parsed
  where numerator_digits is not null
    and denominator_digits is not null
    and old_name ~* ('\s+0*' || numerator_digits || '\s*(/|\s)\s*0*' || denominator_digits || '\s*$')
)
update public.pokemon_cards
set
  name = fixes.new_name,
  normalized_name = lower(trim(regexp_replace(regexp_replace(fixes.new_name, '[^a-zA-Z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))),
  source_metadata = jsonb_set(
    jsonb_set(
      coalesce(public.pokemon_cards.source_metadata, '{}'::jsonb),
      '{displayNameBeforeCleanup}',
      to_jsonb(fixes.old_name),
      true
    ),
    '{nameCleanupRemovedSuffix}',
    to_jsonb(trim(replace(fixes.old_name, fixes.new_name, ''))),
    true
  ),
  updated_at = now()
from fixes
where public.pokemon_cards.id = fixes.id
  and fixes.new_name <> ''
  and fixes.new_name <> fixes.old_name;
