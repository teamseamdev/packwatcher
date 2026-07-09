create table if not exists public.clip_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  product_name text not null,
  total_cost numeric(10,2) not null default 0,
  pack_count integer not null default 1,
  notes text,
  source_video_url text,
  source_video_path text not null,
  source_video_bucket text not null default 'clip-source-videos',
  source_file_name text,
  source_content_type text,
  source_file_size bigint,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'needs_review', 'ready_to_export', 'exporting', 'complete', 'failed')),
  analysis_mode text not null default 'manual' check (analysis_mode in ('manual', 'local_assist', 'ai_assist')),
  total_pull_value numeric(10,2) not null default 0,
  profit_loss numeric(10,2) not null default 0,
  roi_percent numeric(10,2) not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clip_moments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.clip_projects(id) on delete cascade,
  timestamp_start numeric(10,2) not null default 0,
  timestamp_end numeric(10,2) not null default 0,
  moment_type text not null default 'manual',
  confidence numeric(4,3) not null default 0,
  thumbnail_url text,
  thumbnail_path text,
  thumbnail_bucket text,
  include_in_export boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.clip_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.clip_projects(id) on delete cascade,
  moment_id uuid references public.clip_moments(id) on delete cascade,
  card_name text not null default '',
  set_name text,
  card_number text,
  variant text,
  estimated_value numeric(10,2) not null default 0,
  confidence numeric(4,3) not null default 0,
  pricing_source text not null default 'manual',
  recognition_source text not null default 'manual',
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clip_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.clip_projects(id) on delete cascade,
  export_url text,
  export_path text not null,
  export_bucket text not null default 'clip-exports',
  format text not null default 'mp4',
  duration numeric(10,2),
  resolution text not null default '1080x1920',
  status text not null default 'complete',
  created_at timestamptz not null default now()
);

alter table public.clip_projects enable row level security;
alter table public.clip_moments enable row level security;
alter table public.clip_cards enable row level security;
alter table public.clip_exports enable row level security;

drop policy if exists "clip projects own all" on public.clip_projects;
create policy "clip projects own all" on public.clip_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "clip moments own all" on public.clip_moments;
create policy "clip moments own all" on public.clip_moments
  for all using (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_moments.project_id
      and clip_projects.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_moments.project_id
      and clip_projects.user_id = auth.uid()
    )
  );

drop policy if exists "clip cards own all" on public.clip_cards;
create policy "clip cards own all" on public.clip_cards
  for all using (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_cards.project_id
      and clip_projects.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_cards.project_id
      and clip_projects.user_id = auth.uid()
    )
  );

drop policy if exists "clip exports own all" on public.clip_exports;
create policy "clip exports own all" on public.clip_exports
  for all using (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_exports.project_id
      and clip_projects.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.clip_projects
      where clip_projects.id = clip_exports.project_id
      and clip_projects.user_id = auth.uid()
    )
  );

create index if not exists clip_projects_user_created_idx on public.clip_projects(user_id, created_at desc);
create index if not exists clip_moments_project_order_idx on public.clip_moments(project_id, sort_order);
create index if not exists clip_cards_project_idx on public.clip_cards(project_id);
create index if not exists clip_cards_moment_idx on public.clip_cards(moment_id);
create index if not exists clip_exports_project_created_idx on public.clip_exports(project_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('clip-source-videos', 'clip-source-videos', false, coalesce(nullif(current_setting('app.clips_max_upload_bytes', true), '')::bigint, 5368709120), array['video/mp4', 'video/quicktime', 'video/webm']),
  ('clip-thumbnails', 'clip-thumbnails', false, 52428800, array['image/jpeg']),
  ('clip-exports', 'clip-exports', false, 5368709120, array['video/mp4'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "clip source videos user object access" on storage.objects;
create policy "clip source videos user object access" on storage.objects
  for all using (
    bucket_id = 'clip-source-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'clip-source-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "clip thumbnails user object access" on storage.objects;
create policy "clip thumbnails user object access" on storage.objects
  for all using (
    bucket_id = 'clip-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'clip-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "clip exports user object access" on storage.objects;
create policy "clip exports user object access" on storage.objects
  for all using (
    bucket_id = 'clip-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'clip-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
