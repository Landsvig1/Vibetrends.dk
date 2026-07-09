-- Rate-limit infrastructure for POST /api/agentauth (and future routes).
--
-- Uses a single Postgres table + atomic upsert RPC instead of an in-memory
-- counter (which is unreliable under serverless/concurrent invocations) or a
-- paid external service. SECURITY DEFINER lets the anon-keyed Supabase client
-- call the function while the function itself runs with definer privileges,
-- so the table never needs to be directly accessible to the anon role.
--
-- Idempotent: safe to re-run. `create table if not exists` and
-- `create or replace function` ensure no-ops on subsequent executions.

create table if not exists public.rate_limits (
  key          text        primary key,
  window_start timestamptz not null,
  count        int         not null default 0
);

-- Prevent direct reads/writes from the anon and authenticated roles.
-- All access goes through check_and_increment_rate_limit (SECURITY DEFINER).
alter table public.rate_limits enable row level security;

-- check_and_increment_rate_limit
--   Atomically upserts a rate-limit entry and returns whether the caller is
--   still within the allowed limit.
--
--   Behaviour:
--   - First call for a key: inserts (key, now(), 1); returns true if 1 <= p_limit.
--   - Subsequent call within the window: increments count; returns count <= p_limit.
--   - Call after window_seconds have elapsed: resets window_start to now() and
--     count to 1; returns true (first request in the new window always passes).
--
--   Concurrency: the entire upsert is a single INSERT ... ON CONFLICT ... DO UPDATE
--   statement.  Postgres serialises conflicting upserts on the primary key, so
--   two simultaneous callers for the same key cannot both read count=0 and both
--   succeed — one will read the already-incremented value from the other's update.
--
-- Parameters:
--   p_key            — opaque string identifying the rate-limit bucket
--                      (use a hashed IP, never a raw IP, per KTD5)
--   p_limit          — maximum number of requests allowed per window
--   p_window_seconds — window duration in seconds

create or replace function public.check_and_increment_rate_limit(
  p_key            text,
  p_limit          int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case
      when now() - rate_limits.window_start >= (p_window_seconds || ' seconds')::interval
      then now()
      else rate_limits.window_start
    end,
    count = case
      when now() - rate_limits.window_start >= (p_window_seconds || ' seconds')::interval
      then 1
      else rate_limits.count + 1
    end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Allow the anon and authenticated roles to call the function.
-- The function itself is SECURITY DEFINER so it runs as the definer (postgres)
-- and can write to public.rate_limits without exposing the table directly.
grant execute on function public.check_and_increment_rate_limit(text, int, int)
  to anon, authenticated;
