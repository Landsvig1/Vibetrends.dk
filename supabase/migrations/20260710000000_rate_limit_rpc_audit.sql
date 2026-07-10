-- Intrusion detection for check_and_increment_rate_limit (20260709010000_rate_limits.sql).
--
-- That function is EXECUTE-granted to anon/authenticated with a caller-chosen
-- key/limit/window and no server-side secret (tracked as a P0 in
-- docs/residual-review-findings/fix-global-agent-write-rate-limit.md — the
-- real fix is HMAC-keying, deferred pending a new Vercel secret). This
-- migration doesn't close that gap; it detects exploitation of it.
--
-- The app only ever calls this RPC with one of three exact (key-shape, limit,
-- window) combinations (src/lib/rate-limit.ts, src/app/api/agentauth/route.ts):
--   - agentauth:<64-hex-char sha256>   limit=5   window=3600   (IP issuance)
--   - agentwrite:<uuid>                limit=20  window=3600   (per-identity write)
--   - agentwrite:global                limit=200 window=3600   (site-wide backstop)
-- Any call outside those three exact shapes did not originate from this
-- app's own code — it's either a bug or a caller invoking the RPC directly.
--
-- Idempotent: safe to re-run. `create table if not exists` and
-- `create or replace function` ensure no-ops on subsequent executions.

create table if not exists public.rate_limit_rpc_audit (
  id               bigint generated always as identity primary key,
  called_at        timestamptz not null default now(),
  p_key            text        not null,
  p_limit          int         not null,
  p_window_seconds int         not null,
  is_expected      boolean     not null
);

-- Same lockdown as rate_limits itself: no direct anon/authenticated access.
-- The function inserts as SECURITY DEFINER; reads happen via direct DB
-- access (Supabase SQL editor / MCP), not through a public API surface.
alter table public.rate_limit_rpc_audit enable row level security;

-- Index for the query this table exists to serve: recent unexpected calls.
create index if not exists rate_limit_rpc_audit_unexpected_idx
  on public.rate_limit_rpc_audit (called_at desc)
  where not is_expected;

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
  v_is_expected boolean;
begin
  v_is_expected :=
    (p_key ~ '^agentauth:[0-9a-f]{64}$' and p_limit = 5   and p_window_seconds = 3600) or
    (p_key ~ '^agentwrite:[0-9a-f-]{36}$' and p_limit = 20  and p_window_seconds = 3600) or
    (p_key = 'agentwrite:global'        and p_limit = 200 and p_window_seconds = 3600);

  insert into public.rate_limit_rpc_audit (p_key, p_limit, p_window_seconds, is_expected)
  values (p_key, p_limit, p_window_seconds, v_is_expected);

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

grant execute on function public.check_and_increment_rate_limit(text, int, int)
  to anon, authenticated;

-- Query for suspicious activity (run via Supabase SQL editor or MCP execute_sql):
--
--   select called_at, p_key, p_limit, p_window_seconds
--   from public.rate_limit_rpc_audit
--   where not is_expected
--   order by called_at desc
--   limit 50;
--
-- Any row here is a call this app's own code never makes — evidence of
-- someone invoking the RPC directly with the public anon key.
