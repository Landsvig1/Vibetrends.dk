// Deriving a row's creation instant from its id.
//
// Rows created through the app carry an epoch-bearing id: a one-letter type
// prefix, an underscore, and Date.now() at insert time (`s_1785096155359`,
// `p_1784...`, `a_1783...`). That millisecond value is a real creation instant,
// and /api/feed already publishes it as each item's publishedAt.
//
// Legacy rows seeded before that convention use `seed_<name>` ids and carry no
// epoch at all. They get 0 / null here rather than a made-up date.
//
// This module is deliberately import-free: scripts/seed-content-updated-at.mjs
// loads it directly through Node's built-in TypeScript type stripping, and
// Node's ESM resolver would not follow an extensionless relative import from it.
// Same split as src/lib/githubDocSource.ts.

/**
 * Milliseconds since the epoch encoded in an id, or 0 when it carries none.
 *
 * 0 is the "no epoch" signal, not a real date — callers must treat it as absent
 * rather than as 1970.
 */
export function epochFromId(id: string): number {
  // Character comparisons rather than a regex: this runs per row on every feed
  // build, and the shape is fixed enough that the regex bought nothing.
  if (id.length > 2 && id.charCodeAt(1) === 95) { // 95 is '_'
    const first = id.charCodeAt(0);
    if (first >= 97 && first <= 122) { // 'a'-'z'
      const ms = Number(id.slice(2));
      if (!Number.isNaN(ms)) {
        return ms;
      }
    }
  }
  return 0;
}

/**
 * The value `content_updated_at` is seeded with for a skill row: the row's
 * creation instant as an ISO timestamp, or null when the id carries no epoch.
 *
 * Seeding rather than leaving every row null is the whole point of the column
 * being useful. A null-until-first-detected-change rule is strictly honest but
 * permanent, not transitional: every future skill also starts with a null hash,
 * so a stable corpus could emit zero lastmod forever. Creation time is a real,
 * per-row-distinct signal already trusted elsewhere in the codebase, which is
 * exactly what the original shared-build-date bug lacked.
 */
export function contentUpdatedAtSeed(id: string): string | null {
  const ms = epochFromId(id);
  if (!ms) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
