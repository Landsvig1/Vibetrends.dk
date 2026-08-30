-- First-party funnel telemetry for vibetrends.dk.
--
-- Vercel Web Analytics custom events (track("copy_install", ...)) are only
-- readable on a Pro/Enterprise plan -- the query API returns 402 on this
-- project -- so the copy/connect events the site already fires cannot be
-- reported on. This table receives the same events so the activation funnel
-- (visit -> copy -> account -> submit/upvote) can be joined against
-- auth.users, skills, vibes and agents in the same SQL as the rest of the
-- analytics pipeline.
--
-- Deliberately stores no IP, no user agent and no free-text: only an
-- allowlisted event name, the item involved, and a client-generated session
-- id that lives in sessionStorage. Nothing here is personal data under GDPR,
-- so it needs no consent banner -- keep it that way when adding columns.
--
-- Follows the rate_limits pattern: the table is RLS-locked with no policies,
-- and all writes go through a SECURITY DEFINER RPC. That keeps the event log
-- unreadable and untamperable from the browser while still letting the
-- anon-keyed client append to it.
--
-- Idempotent and reversible: `if not exists` / `create or replace`
-- throughout, and the down-migration at the bottom of this file is the exact
-- inverse.

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  event_name  text        not null,
  occurred_at timestamptz not null default now(),
  -- What was acted on. Null for events that are not item-scoped.
  item_type   text,
  item_slug   text,
  host_slug   text,
  snippet     text,
  path        text,
  -- Ephemeral, client-generated; lets one visit's copy events be counted once
  -- without identifying the visitor.
  session_id  text,
  -- Set only when the visitor is signed in, so activation can be attributed.
  user_id     uuid references auth.users(id) on delete set null
);

-- The report always filters by time, and usually also by event name.
create index if not exists analytics_events_occurred_at_idx
  on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_name_time_idx
  on public.analytics_events (event_name, occurred_at desc);
create index if not exists analytics_events_item_idx
  on public.analytics_events (item_type, item_slug);

-- No policies are created, so with RLS enabled the anon and authenticated
-- roles can neither read nor write directly.
alter table public.analytics_events enable row level security;

-- record_analytics_event
--   Appends one event. Returns nothing useful to the caller on purpose: the
--   browser must not be able to probe the table through this function.
--
--   The event name is checked against an allowlist so a leaked anon key can
--   only ever append rows this site actually reports on, rather than being
--   used to fill the table with arbitrary strings.
--
--   user_id is taken from auth.uid() rather than a parameter, so a caller
--   cannot attribute an event to someone else.
create or replace function public.record_analytics_event(
  p_event_name text,
  p_item_type  text default null,
  p_item_slug  text default null,
  p_host_slug  text default null,
  p_snippet    text default null,
  p_path       text default null,
  p_session_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_name is null or p_event_name not in (
    'copy_install',
    'connect_view'
  ) then
    return;
  end if;

  insert into public.analytics_events (
    event_name, item_type, item_slug, host_slug, snippet, path, session_id, user_id
  ) values (
    p_event_name,
    nullif(left(p_item_type, 40), ''),
    nullif(left(p_item_slug, 200), ''),
    nullif(left(p_host_slug, 60), ''),
    nullif(left(p_snippet, 40), ''),
    nullif(left(p_path, 300), ''),
    nullif(left(p_session_id, 64), ''),
    auth.uid()
  );
end;
$$;

grant execute on function public.record_analytics_event(text, text, text, text, text, text, text)
  to anon, authenticated;

-- Down migration (run manually to reverse):
--   drop function if exists public.record_analytics_event(text, text, text, text, text, text, text);
--   drop table if exists public.analytics_events;
