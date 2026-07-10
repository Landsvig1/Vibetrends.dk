import { createHash } from 'crypto';
import { supabasePublic } from '@/lib/supabase-server';

/**
 * Hash an IP address with SHA-256 before storing it as a rate-limit key.
 *
 * Raw IPs are unnecessary personal data for a control that only needs to
 * answer "has this source exceeded N requests in this window" (KTD5 — EU/GDPR
 * context; minimal-retention posture). Never log or return the raw IP.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

/**
 * Check whether `key` is within the allowed rate limit for the current window,
 * incrementing the counter atomically in the same round-trip.
 *
 * Delegates to the `check_and_increment_rate_limit` Postgres function
 * (SECURITY DEFINER), which performs an atomic INSERT … ON CONFLICT … DO UPDATE
 * so concurrent serverless invocations for the same key cannot race past the
 * limit (KTD4).
 *
 * @param key           Rate-limit bucket identifier — use `hashIp(ip)` for
 *                      IP-based limiting; never pass a raw IP.
 * @param limit         Maximum number of requests allowed per window.
 * @param windowSeconds Window duration in seconds.
 * @returns             `true` if the caller is within the limit, `false` if
 *                      they have exceeded it and should receive a 429.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabasePublic.rpc(
    'check_and_increment_rate_limit',
    {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }
  );

  if (error) {
    throw new Error(`Rate limit RPC failed: ${error.message}`);
  }

  return data as boolean;
}

/** Cost-control ceiling on bearer-authenticated (agent) writes — upvotes,
 * submissions, replies. Scoped per identity (`user.id`), not per IP: a
 * refreshed session keeps the same identity indefinitely (see
 * docs/decisions/2026-06-19-agent-auth.md's refresh-token amendment), so
 * per-identity is the only bound that still holds once an agent stops
 * re-provisioning through /api/agentauth's own IP rate limit. Deliberately
 * NOT applied to cookie-authenticated humans — that path already requires a
 * real Supabase signup, a much higher friction barrier than an anonymous
 * bearer token. */
const AGENT_WRITE_LIMIT = 20;
const AGENT_WRITE_WINDOW_SECONDS = 60 * 60;

export async function checkAgentWriteRateLimit(userId: string): Promise<boolean> {
  return checkRateLimit(`agentwrite:${userId}`, AGENT_WRITE_LIMIT, AGENT_WRITE_WINDOW_SECONDS);
}

/** Site-wide backstop, independent of identity or IP. The per-identity cap
 * above bounds one identity's abuse but not horizontal scaling: /api/agentauth
 * mints a fresh identity on every call (capped at 5/hour per IP, uncapped
 * across distinct IPs), and each identity now renews forever via its refresh
 * token. An attacker rotating IPs can mint unbounded identities, each with
 * its own fresh 20/hour budget — so aggregate write throughput has no
 * ceiling without this. Fixed key, no per-identity or per-IP component: 10
 * identities at full legitimate throughput (200 / 20) is generous headroom
 * for this site's current traffic while still bounding worst-case cost to a
 * known number regardless of identity count. Same bot-only scope as the
 * per-identity check — never applied to cookie-authenticated humans. */
const GLOBAL_AGENT_WRITE_LIMIT = 200;
const GLOBAL_AGENT_WRITE_WINDOW_SECONDS = 60 * 60;

export async function checkGlobalAgentWriteRateLimit(): Promise<boolean> {
  return checkRateLimit('agentwrite:global', GLOBAL_AGENT_WRITE_LIMIT, GLOBAL_AGENT_WRITE_WINDOW_SECONDS);
}

/** Combines both agent write guards into the single check every write route
 * needs. Order is deliberate, not incidental: `checkRateLimit` increments on
 * every call, so checking the per-identity budget first means an identity
 * that's already over its own limit short-circuits before ever touching the
 * shared global counter. Running both concurrently (e.g. Promise.all) would
 * let an already-throttled identity keep consuming the site-wide budget on
 * every retry — turning the global backstop into a DoS surface against every
 * other agent instead of a cost ceiling. */
export async function checkAgentWriteAllowed(userId: string): Promise<boolean> {
  const withinIdentityLimit = await checkAgentWriteRateLimit(userId);
  if (!withinIdentityLimit) return false;
  return checkGlobalAgentWriteRateLimit();
}
