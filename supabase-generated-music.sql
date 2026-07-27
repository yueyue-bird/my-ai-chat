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
