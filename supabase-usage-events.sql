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

-- Shared, atomic rate limiting for paid Suno generation requests.
create table if not exists public.generation_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.generation_rate_limits enable row level security;
drop policy if exists "generation_rate_limits_no_public_access" on public.generation_rate_limits;
create policy "generation_rate_limits_no_public_access"
on public.generation_rate_limits for all using (false) with check (false);

create or replace function public.consume_generation_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed boolean;
begin
  if p_key = '' or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.generation_rate_limits (key, window_started_at, request_count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (key) do update
    set window_started_at = case
          when public.generation_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then now() else public.generation_rate_limits.window_started_at end,
        request_count = case
          when public.generation_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then 1 else public.generation_rate_limits.request_count + 1 end,
        updated_at = now()
    where public.generation_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
       or public.generation_rate_limits.request_count < p_limit
  returning true into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.consume_generation_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_generation_rate_limit(text, integer, integer) to service_role;

-- One row per Suno task makes callback processing idempotent across serverless instances.
create table if not exists public.suno_callback_events (
  task_id text primary key,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists suno_callback_events_received_at_idx on public.suno_callback_events (received_at desc);
alter table public.suno_callback_events enable row level security;
drop policy if exists "suno_callback_events_no_public_access" on public.suno_callback_events;
create policy "suno_callback_events_no_public_access"
on public.suno_callback_events for all using (false) with check (false);
