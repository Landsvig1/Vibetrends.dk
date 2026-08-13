import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { revalidateTag as _revalidateTag } from "next/cache";

/**
 * Cache invalidation for writes that happen outside the Next runtime.
 *
 * Why this exists: approving a submission flips `review_state` in Postgres from
 * a GitHub Action (scripts/review-queue.mjs), and an Action cannot call
 * revalidateTag — it isn't running inside the app. Every list read in db.ts is
 * `'use cache'` + cacheLife('max'), i.e. 30 days. Without this route, merging
 * the approval PR would set the flag and change nothing a visitor sees until
 * the profile expired or an unrelated write happened to dump the same tag.
 * getSkillDoc documents the identical trap for the weekly doc refresher, which
 * works around it with a shorter cache profile instead; that option isn't open
 * here, because the whole point is that approval is visible promptly.
 *
 * Deliberately generic (a list of tags) rather than an /approve endpoint: this
 * route only invalidates caches. It cannot change data, so a leaked secret
 * costs a thundering herd of cache misses, not a write. The actual approval is
 * a Postgres UPDATE performed by the Action over DATABASE_URL, where the
 * credential already lives.
 */

// @ts-expect-error — deliberate single-arg form: immediate expiry, not
// stale-while-revalidate. Same constraint (and same reasoning) as db.ts's
// wrapper: the two-arg form defaults to serving stale content, which would
// mean the first reader after an approval still sees the pre-approval list.
const revalidateTag = (tag: string): void => _revalidateTag(tag);

/** Cap on tags per call — bounds the work a single request can trigger. */
const MAX_TAGS = 100;

function isAuthorized(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  // No secret configured means no caller can ever be authorized. Failing
  // closed matters more than a clear error: a misconfigured deploy that
  // accepted every request would be an open cache-buster.
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    // Same response for "no secret set", "wrong secret" and "no header" — the
    // caller is a script we control and does not need the distinction.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const tags = (body as { tags?: unknown })?.tags;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string" || !t)) {
    return NextResponse.json(
      { error: "Body must be { tags: string[] } with non-empty strings" },
      { status: 400 },
    );
  }
  if (tags.length > MAX_TAGS) {
    return NextResponse.json(
      { error: `Too many tags (max ${MAX_TAGS})` },
      { status: 400 },
    );
  }

  for (const tag of tags as string[]) revalidateTag(tag);

  return NextResponse.json({ revalidated: tags.length, tags });
}
