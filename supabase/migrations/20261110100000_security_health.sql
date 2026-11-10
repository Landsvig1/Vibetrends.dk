-- Daily security health snapshot for /api/cron/security-health.
--
-- One read-only function returns two kinds of numbers as jsonb:
--   - volumes over the last 24 hours (new anonymous accounts, the busiest
--     DB write-cap bucket, forum posts from day-old accounts, pending backlog);
--   - drift counters for the invariants in AGENTS.md "Security invariants",
--     where any value other than the expected one means a fix was undone.
-- Thresholds live in src/lib/securityHealth.ts, not here, so they can be
-- tuned and unit-tested without a migration.
--
-- security definer because it reads auth.users and pg_catalog; EXECUTE is
-- service_role only, like the other server-side RPCs. stable, no writes.
--
-- No code dependency: nothing calls it until the cron route is deployed, so it
-- can be applied before or after that deploy.
--
-- Idempotent and reversible: create or replace, repeatable revoke/grant, and
-- the down path is in the trailing comment.

begin;

create or replace function public.security_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with review_tables(t) as (
    values ('skills'), ('agents'), ('vibes'), ('blog_posts')
  ),
  content_tables(t) as (
    values ('skills'), ('agents'), ('vibes'), ('blog_posts'),
           ('forum_threads'), ('forum_replies')
  ),
  forum_posts as (
    select user_id, created_at from public.forum_threads
    union all
    select user_id, created_at from public.forum_replies
  )
  select pg_catalog.jsonb_build_object(
    'anon_users_24h', (
      select pg_catalog.count(*) from auth.users
      where is_anonymous and created_at > pg_catalog.now() - interval '24 hours'
    ),
    -- limit_content_inserts counts every PostgREST insert per user in a
    -- 'dbwrite:<uuid>' bucket. The busiest bucket shows one account nearing
    -- or hitting the DB cap.
    'max_dbwrite_bucket_24h', (
      select coalesce(pg_catalog.max(count), 0) from public.rate_limits
      where key like 'dbwrite:%' and window_start > pg_catalog.now() - interval '24 hours'
    ),
    'fresh_account_forum_posts_24h', (
      select pg_catalog.count(*) from forum_posts p
      join auth.users u on u.id = p.user_id
      where p.created_at > pg_catalog.now() - interval '24 hours'
        and p.created_at - u.created_at < interval '24 hours'
    ),
    'pending_rows', (
      (select pg_catalog.count(*) from public.skills where review_state = 'pending')
      + (select pg_catalog.count(*) from public.agents where review_state = 'pending')
      + (select pg_catalog.count(*) from public.vibes where review_state = 'pending')
      + (select pg_catalog.count(*) from public.blog_posts where review_state = 'pending')
    ),
    'tables_without_rls', (
      select pg_catalog.count(*) from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    ),
    'definer_functions_without_search_path', (
      select pg_catalog.count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.proconfig is null
    ),
    -- is_admin must be a fixed uuid list. Any reference to metadata, email or
    -- claims means identity is being read from somewhere a client can write.
    'is_admin_reads_client_data', (
      select pg_catalog.count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_admin'
        and (p.prosrc ilike '%meta%' or p.prosrc ilike '%email%' or p.prosrc ilike '%jwt%')
    ),
    'is_admin_uuid_count', (
      select coalesce(pg_catalog.max(
        (select pg_catalog.count(*) from pg_catalog.regexp_matches(
          p.prosrc, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g'))
      ), 0)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_admin'
    ),
    -- Server-only RPCs callable by public, anon or authenticated.
    'server_only_functions_exposed', (
      select pg_catalog.count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'record_analytics_event', 'check_and_increment_rate_limit',
          'check_and_increment_dual_rate_limit', 'guard_content_row',
          'limit_content_inserts', 'security_health'
        )
        and (
          pg_catalog.has_function_privilege('anon', p.oid, 'execute')
          or pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
        )
    ),
    -- guard_content_row + limit_content_inserts on each content table: 12.
    'content_guard_triggers', (
      select pg_catalog.count(*) from pg_catalog.pg_trigger tg
      join pg_catalog.pg_class c on c.oid = tg.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not tg.tgisinternal and tg.tgenabled <> 'D'
        and tg.tgname in ('guard_content_row', 'limit_content_inserts')
        and c.relname in (select t from content_tables)
    ),
    -- Every SELECT policy on a reviewed table must gate on review_state,
    -- otherwise pending rows leak to the public.
    'review_select_policies_ungated', (
      select pg_catalog.count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and cmd in ('SELECT', 'ALL')
        and tablename in (select t from review_tables)
        and coalesce(qual, '') not like '%review_state%'
    ),
    -- Every UPDATE policy on a reviewed table must exclude anonymous callers.
    'review_update_policies_allow_anon', (
      select pg_catalog.count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'ALL')
        and tablename in (select t from review_tables)
        and coalesce(qual, '') not like '%is_anonymous_caller%'
    )
  );
$$;

revoke execute on function public.security_health() from public, anon, authenticated;
grant execute on function public.security_health() to service_role;

commit;

-- Down migration (run manually to reverse). Only together with removing the
-- cron route, which otherwise alerts daily that the check could not run.
--
-- begin;
-- drop function if exists public.security_health();
-- commit;
