-- Hardens the intrusion-detection audit added in
-- 20260710000000_rate_limit_rpc_audit.sql, per code review (2026-07-11):
--
-- 1. The agentwrite UUID regex was length/charset-only ([0-9a-f-]{36}), not
--    real UUID structure -- a 36-char string with zero hyphens in the
--    right places also matched. Tightened to enforce 8-4-4-4-12.
-- 2. The audit insert ran unconditionally, including for is_expected=true
--    rows -- nothing in this table's own query or index ever reads those.
--    Now only logs is_expected=false rows, cutting write volume from
--    "every site write" to "actual anomalies" (expected to be rare).
-- 3. The audit insert ran with no failure isolation, coupling any future
--    audit-table issue (RLS misconfig, constraint, disk) to core
--    rate-limit enforcement -- a failure there aborted the whole function
--    before the real rate_limits upsert ran. Now wrapped in its own
--    exception handler: detection is best-effort, enforcement is not.
-- 4. search_path public -> '' (empty), matching the hardening convention
--    every other SECURITY DEFINER function in this project has used since
--    20260618200000_harden_upvote_functions.sql. The body is already
--    fully schema-qualified, so this is a no-op functionally.
--
-- Known, NOT fixed here (see docs/residual-review-findings/
-- fix-global-agent-write-rate-limit.md): is_expected is still a pure
-- (key-shape, limit, window) match with no identity/session binding. A
-- caller who already knows the app's exact constants -- they're in this
-- public migration file -- and sends a real shape (e.g.
-- agentwrite:global / 200 / 3600, or a real victim's
-- agentwrite:<uuid> / 20 / 3600) is indistinguishable from a legitimate
-- app call and still logs is_expected=true. This audit only catches
-- BLUNT/unsophisticated direct callers (wrong limit, malformed key).
-- Closing the sophisticated case requires the HMAC-keying fix already
-- tracked as a separate deferred P0 -- there is no way to distinguish
-- "authorized call with a known public shape" from "unauthorized call
-- mimicking that same public shape" without a server-only secret the
-- caller can't compute.

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
  v_is_expected :=
    (p_key ~ '^agentauth:[0-9a-f]{64}$' and p_limit = 5   and p_window_seconds = 3600) or
    (p_key ~ '^agentwrite:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and p_limit = 20 and p_window_seconds = 3600) or
    (p_key = 'agentwrite:global'        and p_limit = 200 and p_window_seconds = 3600);

  if not v_is_expected then
    begin
      insert into public.rate_limit_rpc_audit (p_key, p_limit, p_window_seconds, is_expected)
      values (p_key, p_limit, p_window_seconds, v_is_expected);
    exception when others then
      -- Detection is best-effort; never let a failure here block the
      -- real rate-limit enforcement below.
      null;
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
