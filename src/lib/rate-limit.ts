import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
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
 * Retrieve the client's real IP address from Vercel-specific or standard HTTP headers.
 *
 * Prefers `x-real-ip` (Vercel edge router IP) as it is not client-controlled,
 * falling back to the last element of `x-forwarded-for` (which represents the
 * direct client connection seen by Vercel edge) to prevent IP spoofing via a
 * spoofed leading entry.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
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
 * submissions, replies. Two tiers, checked atomically in one round trip via
 * `check_and_increment_dual_rate_limit`:
 *   - per identity (`user.id`), 20/hour: a refreshed session keeps the same
 *     identity indefinitely (see docs/decisions/2026-06-19-agent-auth.md's
 *     refresh-token amendment), so per-identity is the only bound that still
 *     holds once an agent stops re-provisioning through /api/agentauth's own
 *     IP rate limit.
 *   - site-wide, 200/hour: bounds horizontal scaling (many identities each
 *     within their own budget) that the per-identity tier alone can't catch.
 *     10 identities at full legitimate throughput (200 / 20) is generous
 *     headroom for this site's current traffic while still bounding
 *     worst-case cost to a known number regardless of identity count.
 *
 * Checking both in a single atomic RPC call (rather than two sequential
 * check-and-increment calls) matters for correctness, not just latency: a
 * naive sequential check-identity-then-check-global increments the identity
 * counter even when the global counter goes on to reject the write, so a
 * well-behaved identity can have its own budget drained purely by other
 * identities' congestion. The combined RPC only increments either counter
 * when BOTH are within budget.
 *
 * Deliberately NOT applied to cookie-authenticated humans — that path
 * already requires a real Supabase signup, a much higher friction barrier
 * than an anonymous bearer token. */
const AGENT_WRITE_LIMIT = 20;
const GLOBAL_AGENT_WRITE_LIMIT = 200;
const AGENT_WRITE_WINDOW_SECONDS = 60 * 60;

export async function checkAgentWriteAllowed(userId: string): Promise<boolean> {
  const { data, error } = await supabasePublic.rpc('check_and_increment_dual_rate_limit', {
    p_key1: `agentwrite:${userId}`,
    p_limit1: AGENT_WRITE_LIMIT,
    p_key2: 'agentwrite:global',
    p_limit2: GLOBAL_AGENT_WRITE_LIMIT,
    p_window_seconds: AGENT_WRITE_WINDOW_SECONDS,
  });

  if (error) {
    throw new Error(`Rate limit RPC failed: ${error.message}`);
  }

  return data as boolean;
}

/** Shared classification every write surface (REST and MCP) needs, so the
 * 503-vs-429 mapping and error logging live in exactly one place instead of
 * being reimplemented per call site. */
export type AgentWriteLimitOutcome = 'ok' | 'rate_limited' | 'service_unavailable';

export async function resolveAgentWriteLimit(userId: string): Promise<AgentWriteLimitOutcome> {
  try {
    const withinLimit = await checkAgentWriteAllowed(userId);
    return withinLimit ? 'ok' : 'rate_limited';
  } catch (error) {
    console.error('Agent write rate-limit RPC failed:', error);
    return 'service_unavailable';
  }
}

/** REST write routes' single entry point for the agent-write cost-control
 * ceiling: `if (actingAs) { const blocked = await enforceAgentWriteRateLimit(actingAs.user.id); if (blocked) return blocked; }`
 *
 * @returns The `NextResponse` to return immediately if the caller is
 *          rate-limited or the check itself failed; `null` if the caller is
 *          within budget and the route should proceed. */
export async function enforceAgentWriteRateLimit(userId: string): Promise<NextResponse | null> {
  const outcome = await resolveAgentWriteLimit(userId);
  if (outcome === 'service_unavailable') {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  if (outcome === 'rate_limited') {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return null;
}
