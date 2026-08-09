-- Close the anon-callable rate-limit RPC gap.
--
-- Both rate-limit functions were `EXECUTE`-granted to `anon`, and the anon key
-- is public by design — it ships in the client bundle. Because the caller
-- supplies the bucket key AND the limit, anyone could call
-- `check_and_increment_dual_rate_limit` directly with:
--
--   p_key1 = <anything>, p_limit1 = <large>,
--   p_key2 = 'agentwrite:global', p_limit2 = 200, p_window_seconds = 3600
--
-- and drive the site-wide agent-write budget to its ceiling in ~200
-- unauthenticated requests, denying writes to every legitimate agent until the
-- window rolled. Renewable indefinitely, hourly. The bucket key is a fixed
-- literal in src/lib/rate-limit.ts, so no reconnaissance is required.
--
-- Availability-only: no data is exposed or modified (the only table touched is
-- `rate_limits`), writes still require a valid bearer token, and RLS
-- (`auth.uid() = user_id`) is untouched. Cookie-authenticated humans bypass the
-- agent-write ceiling entirely, so the human-facing site was never affected.
--
-- This was tracked as a known gap in docs/decisions/2026-06-19-agent-auth.md
-- (final section) and in docs/residual-review-findings/. That note proposed
-- HMAC-keying the buckets with a server-only secret. Revoking is strictly
-- stronger and simpler: it removes the capability rather than making the key
-- harder to guess, and needs no secret-derivation logic. Every call site is a
-- route handler (`/api/agentauth`, `/api/mcp`, `/api/github-meta`, and the REST
-- write routes via `enforceAgentWriteRateLimit`), so the anon role was never
-- required for these functions.
--
-- Two notes on the grants below:
--
--   * REVOKE FROM PUBLIC is the load-bearing one. Postgres grants EXECUTE on
--     every new function to PUBLIC by default, and `anon` inherits it — so
--     revoking from `anon` alone would leave the hole fully open while
--     appearing to close it.
--   * Once PUBLIC is revoked, `service_role` needs an explicit grant. It is a
--     normal role with BYPASSRLS, not a superuser, so it does not get EXECUTE
--     for free.
--
-- The unsalted `hashIp` (sha256 of the raw IP, src/lib/rate-limit.ts) stops
-- being exploitable here for the same reason: a caller who can compute
-- `agentauth:<hash>` for a known IP can no longer execute the function at all.
-- Its separate privacy weakness (unsalted IP hashes are brute-forceable over
-- a 32-bit space, against a comment claiming GDPR data minimisation) is NOT
-- addressed here and remains open.
--
-- DEPLOY ORDER — THIS MIGRATION MUST BE APPLIED **AFTER** THE CODE SHIPS.
-- `checkRateLimit` throws on RPC error, and its callers in /api/mcp and
-- /api/agentauth call it outside their try/catch, so a permission error there
-- becomes a 500 on every request to those routes. Applying this before the
-- service-role client is live takes the MCP endpoint and agent auth down.
-- The reverse order is safe: the service-role client works whether or not the
-- grants have been tightened.
--
-- Idempotent: REVOKE/GRANT are no-ops on re-run.
-- Reversible: see the rollback block at the bottom.

begin;

revoke execute on function public.check_and_increment_rate_limit(text, int, int)
  from public, anon, authenticated;

revoke execute on function public.check_and_increment_dual_rate_limit(text, int, text, int, int)
  from public, anon, authenticated;

grant execute on function public.check_and_increment_rate_limit(text, int, int)
  to service_role;

grant execute on function public.check_and_increment_dual_rate_limit(text, int, text, int, int)
  to service_role;

commit;

-- Rollback (restores the previous, deliberately weaker grants):
--
--   begin;
--   grant execute on function public.check_and_increment_rate_limit(text, int, int)
--     to anon, authenticated;
--   grant execute on function public.check_and_increment_dual_rate_limit(text, int, text, int, int)
--     to anon, authenticated;
--   commit;
--
-- Roll back only alongside reverting the service-role client in
-- src/lib/rate-limit.ts, and note it reopens the denial-of-service above.
