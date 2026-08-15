import { timingSafeEqual } from "crypto";

/**
 * Shared-secret `Authorization: Bearer` check for the routes that machines
 * call: /api/revalidate (GitHub Actions after a submission merge) and
 * /api/internal/hot-sources (the weekly Hot scan).
 *
 * Factored on the second use rather than the seventh. AGENTS.md records that
 * this codebase has hand-rolled the same pattern five and six times over before
 * anyone extracted it; a timing-safe credential comparison is the last place to
 * let that happen, because each hand-rolled copy is a chance to get the
 * length-mismatch guard below subtly wrong.
 */
export function isBearerAuthorized(request: Request, secret: string | undefined): boolean {
  // No secret configured means no caller can ever be authorized. Failing
  // closed matters more than a clear error: a misconfigured deploy that
  // accepted every request would be an open door.
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(header.slice("Bearer ".length).trim());
  const expected = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch, which would itself leak length
  // through the error path — check it first and return the same false.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
