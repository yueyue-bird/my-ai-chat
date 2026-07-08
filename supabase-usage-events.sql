create table if not exists public.usage_events (
  id text primary key,
  created_at timestamptz not null,
  endpoint text not null,
  method text not null,
  status text not null,
  status_code integer not null,
  duration_ms integer not null,
  ip text not null,
  visitor_id text not null,
  user_agent text not null default '',
  referer text not null default '',
  model text,
  title text,
  task_id text,
  error text,
  prompt_chars integer not null default 0
);

create index if not exists usage_events_created_at_idx on public.usage_events (created_at desc);
create index if not exists usage_events_visitor_id_idx on public.usage_events (visitor_id);
create index if not exists usage_events_ip_idx on public.usage_events (ip);
create index if not exists usage_events_endpoint_idx on public.usage_events (endpoint);

alter table public.usage_events enable row level security;

drop policy if exists "usage_events_no_public_access" on public.usage_events;
create policy "usage_events_no_public_access"
on public.usage_events
for all
using (false)
with check (false);
