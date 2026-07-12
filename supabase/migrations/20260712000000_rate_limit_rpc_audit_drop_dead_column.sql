-- Cleanup from code review of the rate-limit-audit chain
-- (20260710000000 .. 20260711020000): since 20260711000000 gated the audit
-- insert to `if not v_is_expected`, every row this table has ever received
-- has is_expected = false by construction — the column is constant across
-- every row and carries no information, and the partial index that
-- predicated on it (`where not is_expected`) now matches 100% of rows,
-- giving it zero selectivity over a plain index.
--
-- v_is_expected remains a local variable in the function below — it still
-- gates whether a row is logged at all. It's just no longer stored as
-- column state once it's already served that purpose.
--
-- Idempotent: safe to re-run.

drop index if exists public.rate_limit_rpc_audit_unexpected_idx;

create index if not exists rate_limit_rpc_audit_called_at_idx
  on public.rate_limit_rpc_audit (called_at desc);

alter table public.rate_limit_rpc_audit
  drop column if exists is_expected;

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
      insert into public.rate_limit_rpc_audit (p_key, p_limit, p_window_seconds)
      values (p_key, p_limit, p_window_seconds);
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
