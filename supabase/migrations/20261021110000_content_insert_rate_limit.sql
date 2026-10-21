-- Per-identity insert ceiling on the six content tables, enforced in the DB.
--
-- The app limits bearer-token writes to 20/h per identity in its route
-- handlers (src/lib/rate-limit.ts). A caller writing through PostgREST never
-- reaches those handlers, so this trigger adds a second, looser ceiling of
-- 40 inserts per hour per auth.uid() across skills, vibes, agents,
-- blog_posts, forum_threads and forum_replies. It sits above the app's
-- limit, so app traffic never hits it. Over the limit the insert raises
-- P0001 'rate_limited'.
--
-- Scope: only fires when current_user is authenticated (anonymous agent
-- identities included). Table-owner writes, the service role and
-- DATABASE_URL scripts are untouched. The function is SECURITY DEFINER
-- because check_and_increment_rate_limit is executable by service_role and
-- the owner only; the WHEN clause is evaluated as the caller, before that.
--
-- Idempotent and reversible: create or replace plus drop-then-create
-- triggers, down path in a comment at the bottom. Apply after the app code
-- that maps 'rate_limited' to a 429 has deployed.

begin;

create or replace function public.limit_content_inserts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A null uid makes the key null, which the RPC answers with false.
  if not public.check_and_increment_rate_limit('dbwrite:' || auth.uid()::text, 40, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_content_inserts() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'skills', 'vibes', 'agents', 'blog_posts', 'forum_threads', 'forum_replies'
  ] loop
    execute format('drop trigger if exists limit_content_inserts on public.%I', t);
    execute format(
      'create trigger limit_content_inserts before insert on public.%I '
      'for each row when (current_user = ''authenticated'') '
      'execute function public.limit_content_inserts()',
      t
    );
  end loop;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- DOWN
--
-- begin;
-- drop trigger if exists limit_content_inserts on public.skills;
-- drop trigger if exists limit_content_inserts on public.vibes;
-- drop trigger if exists limit_content_inserts on public.agents;
-- drop trigger if exists limit_content_inserts on public.blog_posts;
-- drop trigger if exists limit_content_inserts on public.forum_threads;
-- drop trigger if exists limit_content_inserts on public.forum_replies;
-- drop function if exists public.limit_content_inserts();
-- commit;
