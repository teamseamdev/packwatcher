alter table public.app_usage_events
  add column if not exists scan_event_id text;

create unique index if not exists app_usage_events_user_kind_scan_event_unique_idx
  on public.app_usage_events(user_id, usage_kind, scan_event_id)
  where scan_event_id is not null;
