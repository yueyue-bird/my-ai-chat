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

create table if not exists public.music_shares (
  share_id text primary key check (share_id ~ '^[A-Za-z0-9_-]{32,128}$'),
  task_id text not null,
  track_id text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint music_shares_generated_music_fkey
    foreign key (task_id, track_id)
    references public.generated_music (task_id, track_id)
    on delete cascade
);

create index if not exists music_shares_track_idx
on public.music_shares (task_id, track_id, created_at desc);

alter table public.music_shares enable row level security;

revoke all on table public.music_shares from public, anon, authenticated;
grant select, insert, update, delete on table public.music_shares to service_role;

drop policy if exists "music_shares_no_public_access" on public.music_shares;
create policy "music_shares_no_public_access"
on public.music_shares
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

create table if not exists public.music_persistence_jobs (
  task_id text primary key,
  status text not null check (status in ('running', 'completed', 'failed')),
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.music_persistence_jobs enable row level security;

revoke all on table public.music_persistence_jobs from anon, authenticated;
grant select, insert, update, delete on table public.music_persistence_jobs to service_role;

drop policy if exists "music_persistence_jobs_no_public_access" on public.music_persistence_jobs;
create policy "music_persistence_jobs_no_public_access"
on public.music_persistence_jobs
for all
using (false)
with check (false);

create or replace function public.claim_music_persistence(
  p_task_id text,
  p_lease_seconds integer default 300
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
  current_status text;
begin
  insert into public.music_persistence_jobs (task_id, status, locked_until, updated_at)
  values (
    p_task_id,
    'running',
    now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))),
    now()
  )
  on conflict (task_id) do update
  set
    status = 'running',
    locked_until = excluded.locked_until,
    updated_at = now()
  where
    music_persistence_jobs.status = 'failed'
    or (
      music_persistence_jobs.status = 'running'
      and music_persistence_jobs.locked_until <= now()
    )
  returning true into claimed;

  if claimed then
    return 'claimed';
  end if;

  select status
  into current_status
  from public.music_persistence_jobs
  where task_id = p_task_id;

  return coalesce(current_status, 'running');
end;
$$;

revoke all on function public.claim_music_persistence(text, integer) from public, anon, authenticated;
grant execute on function public.claim_music_persistence(text, integer) to service_role;
