-- Fixes 2 findings from code review of the fix/global-agent-write-rate-limit
-- branch (docs/residual-review-findings/fix-global-agent-write-rate-limit.md's
-- sibling PR review):
--
-- 1. NULL-arg probe defeats the audit fix. `check_and_increment_rate_limit`
--    logs an audit row for an out-of-shape call (e.g. p_key = NULL) inside its
--    own `begin/exception` block, then unconditionally runs
--    `insert into public.rate_limits (key, ...) values (p_key, ...)`.
--    `rate_limits.key` is `text primary key` (NOT NULL) — a NULL p_key raises
--    an unhandled not_null_violation there, which aborts the whole function's
--    transaction, rolling back the audit row that had already "succeeded"
--    moments earlier in the same call. Net effect: the exact NULL-arg probe
--    20260711010000 claims to have made visible still produces zero audit
--    rows. Fixed by failing closed (return false, no rate_limits write)
--    whenever any argument is NULL, logged via the existing best-effort audit
--    path first.
--
-- 2. Collateral budget drain between the two agent-write tiers. The app
--    checked the per-identity budget and the global budget as two sequential
--    `check_and_increment_rate_limit` calls (src/lib/rate-limit.ts's
--    `checkAgentWriteAllowed`) — each call increments its own counter
--    regardless of whether the *other* tier ultimately rejects the write.
--    A well-behaved identity well within its own 20/hour budget still burns
--    its own quota on every write rejected by global congestion from other
--    identities; enough retries during a busy window exhaust that identity's
--    budget purely from writes that could never have succeeded. Fixed by
--    adding `check_and_increment_dual_rate_limit`, which checks and
--    increments BOTH counters atomically in one round trip: if either is
--    over budget, NEITHER counter is incremented (only an expired window's
--    timestamp is reset, so it isn't stuck "expired" forever). This also
--    collapses what was 2 sequential RPC round trips per write into 1.
--
--    Same known, already-tracked limitation as the rest of this rate-limit
--    system (see docs/residual-review-findings/fix-global-agent-write-rate-limit.md's
--    P0 on `check_and_increment_rate_limit` being `anon`-callable with a
--    caller-chosen key): this new function is also `anon`-callable with
--    caller-chosen keys, because the app itself calls it as the anon role.
--    Not a new gap — the HMAC-keying fix already deferred there closes this
--    function too once it lands.
--
-- Idempotent: safe to re-run. `create or replace function` and `grant
-- execute` are no-ops on subsequent executions.

-- Part 1: fail closed on NULL args instead of crashing mid-transaction.
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
  -- Only agentauth's per-IP issuance check still calls this single-key
  -- function directly (agent-write checks now go through
  -- check_and_increment_dual_rate_limit below) — so an agentwrite:* shape
  -- arriving here is now itself anomalous, not just a malformed variant of
  -- an expected shape. Narrowed accordingly; this makes detection strictly
  -- more precise, not less.
  v_is_expected := coalesce(
    (p_key ~ '^agentauth:[0-9a-f]{64}$' and p_limit = 5 and p_window_seconds = 3600),
    false
  );

  if not v_is_expected then
    begin
      insert into public.rate_limit_rpc_audit (p_key, p_limit, p_window_seconds)
      values (p_key, p_limit, p_window_seconds);
    exception when others then
      raise warning 'rate_limit_rpc_audit insert failed: % (%)', sqlerrm, sqlstate;
    end;
  end if;

  -- Fail closed on any NULL argument instead of letting the rate_limits
  -- insert below raise an uncaught not_null_violation on p_key, which would
  -- abort this whole transaction and roll back the audit row logged above.
  if p_key is null or p_limit is null or p_window_seconds is null then
    return false;
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

-- Part 2: atomic dual-key check for the two agent-write tiers (per-identity
-- + global). All-or-nothing: a write blocked by either budget consumes
-- neither counter.
create or replace function public.check_and_increment_dual_rate_limit(
  p_key1           text,
  p_limit1         int,
  p_key2           text,
  p_limit2         int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now             timestamptz := now();
  v_window_start1   timestamptz;
  v_count1          int;
  v_window_start2   timestamptz;
  v_count2          int;
  v_expired1        boolean;
  v_expired2        boolean;
  v_effective_count1 int;
  v_effective_count2 int;
  v_allowed         boolean;
begin
  if p_key1 is null or p_limit1 is null or p_key2 is null or p_limit2 is null
     or p_window_seconds is null or p_key1 = p_key2 then
    return false;
  end if;

  -- Ensure both rows exist so they can be locked together below.
  insert into public.rate_limits (key, window_start, count)
  values (p_key1, v_now, 0)
  on conflict (key) do nothing;

  insert into public.rate_limits (key, window_start, count)
  values (p_key2, v_now, 0)
  on conflict (key) do nothing;

  -- Lock both rows in a stable (sorted) order so two concurrent calls
  -- touching the same two keys can never lock them in opposite order and
  -- deadlock.
  perform 1 from public.rate_limits where key in (p_key1, p_key2) order by key for update;

  select window_start, count into v_window_start1, v_count1
    from public.rate_limits where key = p_key1;
  select window_start, count into v_window_start2, v_count2
    from public.rate_limits where key = p_key2;

  v_expired1 := (v_now - v_window_start1) >= (p_window_seconds || ' seconds')::interval;
  v_expired2 := (v_now - v_window_start2) >= (p_window_seconds || ' seconds')::interval;

  v_effective_count1 := case when v_expired1 then 0 else v_count1 end;
  v_effective_count2 := case when v_expired2 then 0 else v_count2 end;

  v_allowed := (v_effective_count1 + 1 <= p_limit1) and (v_effective_count2 + 1 <= p_limit2);

  if v_allowed then
    update public.rate_limits
      set window_start = case when v_expired1 then v_now else window_start end,
          count = v_effective_count1 + 1
      where key = p_key1;

    update public.rate_limits
      set window_start = case when v_expired2 then v_now else window_start end,
          count = v_effective_count2 + 1
      where key = p_key2;
  else
    -- Rejected: increment neither counter (that's the whole point — a write
    -- blocked by one budget must not consume the other). Still persist an
    -- expired window's reset so it isn't stuck "expired" on the next call.
    if v_expired1 then
      update public.rate_limits set window_start = v_now, count = 0 where key = p_key1;
    end if;
    if v_expired2 then
      update public.rate_limits set window_start = v_now, count = 0 where key = p_key2;
    end if;
  end if;

  return v_allowed;
end;
$$;

grant execute on function public.check_and_increment_dual_rate_limit(text, int, text, int, int)
  to anon, authenticated;
