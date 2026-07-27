create table if not exists public.generated_music (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  track_id text not null,
  visitor_id text not null,
  title text not null,
  tags text not null default '',
  audio_url text not null default '',
  image_url text not null default '',
  audio_path text,
  image_path text,
  prompt text not null default '',
  negative_tags text not null default '',
  model text not null default '',
  duration double precision not null default 0 check (duration >= 0),
  created_at timestamptz not null default now(),
  unique (task_id, track_id)
);

create index if not exists generated_music_created_at_idx on public.generated_music (created_at desc);
create index if not exists generated_music_visitor_created_at_idx on public.generated_music (visitor_id, created_at desc);

alter table public.generated_music enable row level security;

revoke all on table public.generated_music from anon, authenticated;
grant select, insert, update, delete on table public.generated_music to service_role;

drop policy if exists "generated_music_no_public_access" on public.generated_music;
create policy "generated_music_no_public_access"
on public.generated_music
for all
using (false)
with check (false);

create table if not exists public.music_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  trigger text not null check (trigger in ('cron', 'persist', 'admin')),
  dry_run boolean not null default false,
  retention_days integer not null check (retention_days > 0),
  budget_bytes bigint not null check (budget_bytes > 0),
  initial_blob_bytes bigint not null default 0 check (initial_blob_bytes >= 0),
  final_blob_bytes bigint not null default 0 check (final_blob_bytes >= 0),
  deleted_tracks integer not null default 0 check (deleted_tracks >= 0),
  deleted_blobs integer not null default 0 check (deleted_blobs >= 0),
  deleted_usage_events integer not null default 0 check (deleted_usage_events >= 0),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists music_cleanup_runs_started_at_idx
on public.music_cleanup_runs (started_at desc);

alter table public.music_cleanup_runs enable row level security;

revoke all on table public.music_cleanup_runs from anon, authenticated;
grant select, insert on table public.music_cleanup_runs to service_role;

drop policy if exists "music_cleanup_runs_no_public_access" on public.music_cleanup_runs;
create policy "music_cleanup_runs_no_public_access"
on public.music_cleanup_runs
for all
using (false)
with check (false);
