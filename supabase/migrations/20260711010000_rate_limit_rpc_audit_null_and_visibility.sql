-- Fixes 2 confirmed findings from code review of
-- 20260711000000_rate_limit_rpc_audit_hardening.sql:
--
-- 1. NULL-arg audit bypass. v_is_expected used SQL three-valued logic
--    directly: if p_limit or p_window_seconds was NULL (with an otherwise
--    valid p_key), every OR-branch evaluated to NULL instead of a definite
--    TRUE/FALSE, and `if not v_is_expected then` treats a NULL condition as
--    FALSE in PL/pgSQL -- so the audit block was silently skipped. The call
--    still succeeded cleanly against rate_limits (p_key alone is enough to
--    satisfy its NOT NULL primary key), leaving a fully anomalous call with
--    zero forensic trace -- the cheapest possible way to defeat detection.
--    Fixed by wrapping the whole computation in coalesce(..., false): any
--    NULL-driven ambiguity now collapses to "not expected" (the safe
--    default for a detection mechanism) instead of "skip logging."
--
-- 2. Silent exception swallowing. `exception when others then null;` gave
--    zero signal if the audit insert ever started failing for a real
--    reason (RLS drift, a future constraint, disk pressure) -- detection
--    could go dark indefinitely with nothing to notice. Fixed with
--    `raise warning` carrying sqlerrm/sqlstate, which reaches Postgres's
--    server log (visible via Supabase's log explorer) without blocking
--    enforcement -- detection stays best-effort, but failures are now
--    observable instead of silent.

create or replace function public.check_and_increment_rate_limit(
  p_key            text,
  p_limit          int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_is_expected boolean;
begin
  v_is_expected := coalesce(
    (p_key ~ '^agentauth:[0-9a-f]{64}$' and p_limit = 5   and p_window_seconds = 3600) or
    (p_key ~ '^agentwrite:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and p_limit = 20 and p_window_seconds = 3600) or
    (p_key = 'agentwrite:global'        and p_limit = 200 and p_window_seconds = 3600),
    false
  );

  if not v_is_expected then
    begin
      insert into public.rate_limit_rpc_audit (p_key, p_limit, p_window_seconds, is_expected)
      values (p_key, p_limit, p_window_seconds, v_is_expected);
    exception when others then
      -- Detection is best-effort; never let a failure here block the real
      -- rate-limit enforcement below. But surface it, unlike before --
      -- silent swallowing is how detection dies without anyone noticing.
      raise warning 'rate_limit_rpc_audit insert failed: % (%)', sqlerrm, sqlstate;
    end;
  end if;

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
