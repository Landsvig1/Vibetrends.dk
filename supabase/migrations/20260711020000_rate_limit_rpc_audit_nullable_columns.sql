-- Fixes a bug the prior migration (20260711010000) just introduced:
-- coalesce(..., false) now correctly classifies a NULL-arg call as
-- "not expected" and attempts to log it, but rate_limit_rpc_audit's
-- p_key/p_limit/p_window_seconds columns were all NOT NULL -- so the
-- exact anomalous calls this is meant to capture (NULL args) fail their
-- own NOT NULL constraint on insert, get caught by the exception handler,
-- and only reach a RAISE WARNING (Postgres server log) instead of a
-- queryable row. Verified live: a p_window_seconds=null probe against
-- agentwrite:global logged zero rows before this fix.
--
-- The audit table's whole purpose is to record what a caller actually
-- sent, including malformed/NULL values -- so these columns must accept
-- NULL. Idempotent: safe to re-run.

alter table public.rate_limit_rpc_audit
  alter column p_key drop not null,
  alter column p_limit drop not null,
  alter column p_window_seconds drop not null;
