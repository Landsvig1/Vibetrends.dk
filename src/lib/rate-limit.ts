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
