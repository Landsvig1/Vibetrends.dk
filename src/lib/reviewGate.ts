/**
 * Which submissions are held for review before the public can see them.
 *
 * Background: an agent with no signup can obtain a bearer token from
 * POST /api/agentauth and write to the catalog in one more call. Before this
 * module existed, that row was public on the next read. PRODUCT.md's
 * positioning ("curated, never scraped") does not survive an open write
 * endpoint, so agent submissions now land as `review_state = 'pending'` and
 * become visible only when a human merges the PR that carries them.
 *
 * Two separate questions live here, and conflating them is the mistake this
 * file is shaped to prevent:
 *
 *   1. WHO gets held — `shouldHoldForReview`, keyed on whether the caller
 *      authenticated with a bearer token. Logged-in humans publish directly;
 *      they already cleared a magic link and the form honeypot.
 *   2. WHICH tables hide pending rows from public reads — `isGateEnabled`.
 *
 * They are not the same set. forum_threads/forum_replies carry the column and
 * run the same write path, but their gate ships OFF (see FORUM_GATE_ENABLED).
 */

/** The only values `review_state` may take. Mirrors the CHECK constraint in
 *  supabase/migrations/20260813000000_review_state.sql — change both together. */
export const REVIEW_STATES = ["pending", "approved"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Tables that carry a `review_state` column. */
export type ReviewedTable =
  | "skills"
  | "vibes"
  | "agents"
  | "blog_posts"
  | "forum_threads"
  | "forum_replies";

/**
 * The forum's gate, disabled by a constant rather than by omitting the column.
 *
 * Gating the forum now would be self-sealing in exactly the way
 * lib/hubContent.ts already documents for the nav: /forum is the one hub a
 * visitor can fill, it currently has no activity, and holding its first thread
 * for a day of review is how a community surface never starts. PRODUCT.md
 * names community traction as the success metric and an inert catalog as the
 * failure state.
 *
 * It is a constant and not a migration so that turning it on later is a
 * one-line code change with no schema work and no backfill: the column, the
 * write path and the read filters are all already in place and exercised by
 * the four catalog tables. Flip this to `true` and the forum is gated on the
 * next deploy.
 */
const FORUM_GATE_ENABLED = false;

const GATE_ENABLED: Record<ReviewedTable, boolean> = {
  skills: true,
  vibes: true,
  agents: true,
  blog_posts: true,
  forum_threads: FORUM_GATE_ENABLED,
  forum_replies: FORUM_GATE_ENABLED,
};

/** Whether public reads of `table` must exclude pending rows. */
export function isGateEnabled(table: ReviewedTable): boolean {
  return GATE_ENABLED[table];
}

/**
 * The `review_state` a new row should be written with.
 *
 * `isBearerCaller` is true exactly when the request authenticated with an
 * `Authorization: Bearer` header rather than a session cookie — i.e. when
 * `resolveRequestIdentity()` returned a `botAuth`. That is the seam because
 * `getAuthUser()` is tried first and rejects anonymous sessions, so a cookie
 * caller is always a real, magic-link-authenticated human.
 *
 * Note this holds ALL bearer callers, including a human running a script with
 * their own session token — not just the anonymous identities /api/agentauth
 * mints. That is deliberate: the bearer path has no honeypot and no human at
 * the keyboard, which is what review is for. The database-level backstop in
 * the RLS policy is narrower (it can only see `is_anonymous` in the JWT, not
 * which header carried the token) — see the migration for why the two
 * boundaries differ and why that is still sound.
 */
export function reviewStateForWrite(
  table: ReviewedTable,
  isBearerCaller: boolean,
): ReviewState {
  if (!isGateEnabled(table)) return "approved";
  return isBearerCaller ? "pending" : "approved";
}

/**
 * What a submit endpoint returns when the row was held for review.
 *
 * Deliberately NOT the created entity. Returning the row with a 201 would tell
 * a truthful agent something false — that the thing it just submitted is now
 * in the catalog — and a well-behaved agent would go on to link to a URL that
 * 404s. The shape is flat and self-describing so an agent can branch on
 * `status` without consulting the docs.
 */
export interface PendingSubmission {
  status: "pending";
  /** The row's id, so a caller can correlate it with the eventual publication. */
  id: string;
  message: string;
  /** Human-readable explanation of the review process. */
  moreInfo: string;
}

/** Body for the 202 a held submission returns. See PendingSubmission. */
export function pendingSubmissionBody(id: string): PendingSubmission {
  return {
    status: "pending",
    id,
    message:
      "Modtaget og sat i kø til gennemsyn. Bidraget er ikke offentligt endnu og " +
      "optræder hverken i kataloget, i /api-svar, i feedet eller i sitemap, " +
      "før et menneske har godkendt det. Afviste bidrag slettes.",
    moreInfo: "https://vibetrends.dk/agent-guide",
  };
}

/**
 * Narrow a PostgREST query to publicly visible rows.
 *
 * A no-op when the table's gate is off, so the forum's reads run byte-identical
 * SQL to what they ran before this shipped.
 *
 * The parameter is an unconstrained `Q` with the `.eq()` shape asserted inside,
 * rather than the more natural `Q extends { eq(...): Q }`. That constraint is
 * what you want and it does not compile: PostgrestFilterBuilder's `.eq()`
 * returns a polymorphic `this` over four type parameters, and matching it
 * against a self-referential constraint sends the checker into TS2589 ("type
 * instantiation is excessively deep"). Every db.ts call site passes a real
 * builder, and `.eq()` genuinely returns the same type it was called on, so the
 * assertion is sound — one contained cast here beats a cast at all 24 sites.
 */
export function visibleOnly<Q>(query: Q, table: ReviewedTable): Q {
  if (!isGateEnabled(table)) return query;
  return (query as { eq(column: string, value: string): Q }).eq(
    "review_state",
    "approved",
  );
}
