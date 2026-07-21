-- Card centering precheck analyses and private photo storage.

create table if not exists public.card_centering_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  canonical_card_id uuid references public.pokemon_cards(id) on delete set null,
  front_original_path text,
  front_corrected_path text,
  back_original_path text,
  back_corrected_path text,
  front_left_margin numeric,
  front_right_margin numeric,
  front_top_margin numeric,
  front_bottom_margin numeric,
  back_left_margin numeric,
  back_right_margin numeric,
  back_top_margin numeric,
  back_bottom_margin numeric,
  front_lr_ratio text,
  front_tb_ratio text,
  back_lr_ratio text,
  back_tb_ratio text,
  front_confidence text check (front_confidence in ('high', 'medium', 'low')),
  back_confidence text check (back_confidence in ('high', 'medium', 'low')),
  overall_confidence text not null default 'low' check (overall_confidence in ('high', 'medium', 'low')),
  recommendation text not null default 'retake' check (recommendation in ('excellent', 'strong', 'acceptable', 'off_center', 'retake')),
  detection_method text not null default 'manual',
  reference_image_used text,
  reference_registration_score numeric,
  grading_standard_version text not null,
  analysis_engine_version text not null,
  user_adjusted_corners boolean not null default true,
  sleeve_toploader_warning boolean not null default false,
  measurements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.card_centering_analyses enable row level security;

create index if not exists card_centering_analyses_user_idx
  on public.card_centering_analyses(user_id, created_at desc);

create index if not exists card_centering_analyses_inventory_idx
  on public.card_centering_analyses(inventory_item_id, created_at desc);

create index if not exists card_centering_analyses_card_idx
  on public.card_centering_analyses(canonical_card_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'card_centering_analyses'
      and policyname = 'centering analyses own all'
  ) then
    create policy "centering analyses own all"
      on public.card_centering_analyses
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'card_centering_analyses'
      and policyname = 'centering analyses admin select'
  ) then
    create policy "centering analyses admin select"
      on public.card_centering_analyses
      for select
      using (public.is_admin());
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-centering',
  'card-centering',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "card centering user object access" on storage.objects;
create policy "card centering user object access" on storage.objects
  for all
  using (
    bucket_id = 'card-centering'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'card-centering'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
