-- Make record_analytics_event callable from the server only.
--
-- The browser now posts events to POST /api/events, which rate-limits per IP
-- and calls this function with the service role. So:
--   - EXECUTE is revoked from public, anon and authenticated and granted to
--     service_role only.
--   - auth.uid() is null under the service role, so the signed-in user is
--     passed as p_user_id instead. The route takes it from the session cookie,
--     never from the request body, and only service_role can call this.
--   - search_path is pinned to '' with schema-qualified names.
--
-- ORDERING: apply AFTER the /api/events code is deployed. Before that, the
-- deployed client still calls this RPC with the anon key and the revoke would
-- silently drop every event. The route omits p_user_id for signed-out
-- visitors, so it also works against the old 7-argument function in the gap
-- between deploy and this migration (signed-in events are dropped until then).
--
-- Idempotent and reversible: drop-if-exists then create, revoke/grant are
-- repeatable, and the down path is in the trailing comment.

begin;

drop function if exists public.record_analytics_event(text, text, text, text, text, text, text);

create or replace function public.record_analytics_event(
  p_event_name text,
  p_item_type  text default null,
  p_item_slug  text default null,
  p_host_slug  text default null,
  p_snippet    text default null,
  p_path       text default null,
  p_session_id text default null,
  p_user_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
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
    nullif(pg_catalog.left(p_item_type, 40), ''),
    nullif(pg_catalog.left(p_item_slug, 200), ''),
    nullif(pg_catalog.left(p_host_slug, 60), ''),
    nullif(pg_catalog.left(p_snippet, 40), ''),
    nullif(pg_catalog.left(p_path, 300), ''),
    nullif(pg_catalog.left(p_session_id, 64), ''),
    p_user_id
  );
end;
$$;

revoke execute on function public.record_analytics_event(text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_analytics_event(text, text, text, text, text, text, text, uuid)
  to service_role;

commit;

-- Down migration (run manually to reverse). Restores the anon-callable
-- 7-argument function from 20260830120000_analytics_events.sql. Only do this
-- together with reverting the client to call the RPC directly.
--
-- begin;
-- drop function if exists public.record_analytics_event(text, text, text, text, text, text, text, uuid);
-- create or replace function public.record_analytics_event(
--   p_event_name text,
--   p_item_type  text default null,
--   p_item_slug  text default null,
--   p_host_slug  text default null,
--   p_snippet    text default null,
--   p_path       text default null,
--   p_session_id text default null
-- )
-- returns void
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   if p_event_name is null or p_event_name not in (
--     'copy_install',
--     'connect_view'
--   ) then
--     return;
--   end if;
--
--   insert into public.analytics_events (
--     event_name, item_type, item_slug, host_slug, snippet, path, session_id, user_id
--   ) values (
--     p_event_name,
--     nullif(left(p_item_type, 40), ''),
--     nullif(left(p_item_slug, 200), ''),
--     nullif(left(p_host_slug, 60), ''),
--     nullif(left(p_snippet, 40), ''),
--     nullif(left(p_path, 300), ''),
--     nullif(left(p_session_id, 64), ''),
--     auth.uid()
--   );
-- end;
-- $$;
-- grant execute on function public.record_analytics_event(text, text, text, text, text, text, text)
--   to anon, authenticated;
-- commit;
