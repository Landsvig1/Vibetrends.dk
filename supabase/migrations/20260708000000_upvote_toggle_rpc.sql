-- Toggle-upvote RPC: performs the insert-or-delete toggle and returns the
-- authoritative updated upvotes count from the parent table in a single
-- database round-trip (previously 2-3 sequential Supabase calls).
--
-- Before this RPC the non-admin upvote path was:
--   1. INSERT into *_upvotes join table                              (round-trip 1)
--   2. If 23505 unique-violation: DELETE from *_upvotes (toggle-off)(round-trip 2)
--   3. SELECT upvotes from parent table (count lives there via trigger)(round-trip 3)
-- = 2 calls on first upvote, 3 on toggle-off.
--
-- This RPC wraps all three steps in a single PLPGSQL transaction: the
-- existing AFTER INSERT / AFTER DELETE triggers on each *_upvotes table
-- still run inside that transaction, so the parent-table counter is
-- up-to-date by the time the final SELECT executes.  The RPC does NOT
-- bypass or replace those triggers — they remain the authoritative
-- counter-sync mechanism.
--
-- Design: single parameterised function (mirrors admin_bump_upvotes)
-- with per-entity if/elsif branches.  The join-table names and FK
-- column names differ enough per entity that a dynamic-SQL generic
-- implementation would be harder to audit and more fragile; the explicit
-- branches are the same pattern already used in admin_bump_upvotes.
--
-- Security: SECURITY DEFINER so the function body can write to the join
-- tables (which are RLS-enabled) without requiring the caller to have a
-- separate INSERT/DELETE grant.  The function enforces its own user_id
-- = auth.uid() predicate on every INSERT/DELETE, giving equivalent
-- access control to the existing RLS policies.  Callers that are not
-- authenticated get an exception rather than a silent failure.
--
-- Idempotent: CREATE OR REPLACE FUNCTION — safe to re-run; no DROP.
--
-- Returns: the updated upvotes count (integer) after the toggle, or NULL
-- if the target entity does not exist.
--
-- Reverse with:
--   drop function if exists public.toggle_upvote(text, text);

create or replace function public.toggle_upvote(kind text, target_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  calling_user_id uuid;
  new_count        integer;
begin
  calling_user_id := auth.uid();
  if calling_user_id is null then
    raise exception 'not authenticated';
  end if;

  if kind = 'vibe' then
    begin
      insert into public.vibes_upvotes (user_id, project_id)
        values (calling_user_id, target_id);
    exception when unique_violation then
      delete from public.vibes_upvotes
        where user_id = calling_user_id and project_id = target_id;
    end;
    -- The AFTER INSERT / AFTER DELETE trigger on vibes_upvotes has already
    -- updated public.vibes.upvotes within this transaction.  A plain SELECT
    -- inside the same plpgsql block sees the committed-within-transaction state.
    select upvotes into new_count from public.vibes where id = target_id;

  elsif kind = 'thread' then
    begin
      insert into public.thread_upvotes (user_id, thread_id)
        values (calling_user_id, target_id);
    exception when unique_violation then
      delete from public.thread_upvotes
        where user_id = calling_user_id and thread_id = target_id;
    end;
    select upvotes into new_count from public.forum_threads where id = target_id;

  elsif kind = 'agent' then
    begin
      insert into public.agent_upvotes (user_id, agent_id)
        values (calling_user_id, target_id);
    exception when unique_violation then
      delete from public.agent_upvotes
        where user_id = calling_user_id and agent_id = target_id;
    end;
    select upvotes into new_count from public.agents where id = target_id;

  elsif kind = 'reply' then
    begin
      insert into public.reply_upvotes (user_id, reply_id)
        values (calling_user_id, target_id);
    exception when unique_violation then
      delete from public.reply_upvotes
        where user_id = calling_user_id and reply_id = target_id;
    end;
    select upvotes into new_count from public.forum_replies where id = target_id;

  elsif kind = 'skill' then
    begin
      insert into public.skill_upvotes (user_id, skill_id)
        values (calling_user_id, target_id);
    exception when unique_violation then
      delete from public.skill_upvotes
        where user_id = calling_user_id and skill_id = target_id;
    end;
    select upvotes into new_count from public.skills where id = target_id;

  else
    raise exception 'unknown upvote kind: %', kind;
  end if;

  -- new_count is NULL only when target_id does not exist in the parent table
  -- (the SELECT found no row).  Callers treat NULL as "entity not found" and
  -- distinct from 0 (legitimate zero-vote toggle-off).
  return new_count;
end;
$$;

-- Deny direct EXECUTE to public/anon; authenticated users invoke it through
-- the Supabase client with a valid JWT, which satisfies auth.uid() inside.
revoke execute on function public.toggle_upvote(text, text) from public, anon;
grant  execute on function public.toggle_upvote(text, text) to authenticated;
