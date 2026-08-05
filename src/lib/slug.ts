/**
 * Title → URL slug, in one place.
 *
 * Used by the write paths in src/lib/db.ts, by scripts/backfill-slugs.mjs (which
 * imports this module directly rather than reimplementing the rules in SQL), and
 * by anything that needs to predict a slug. A second copy would have to "match
 * exactly" with nothing enforcing it — see KTD6 in
 * docs/plans/2026-08-04-001-feat-danish-descriptions-slugs-lastmod-plan.md.
 *
 * Hard invariant: the output never contains an underscore. src/proxy.ts decides
 * whether an incoming param is a legacy ID by matching /^(s_\d+|p_\d+|a_\d+|seed_)/,
 * and that gate is what keeps slug requests (the hot path) from costing a
 * Supabase round trip. An underscore-emitting slugify would break it.
 *
 * Collision resolution is deliberately NOT here: it needs database state. The
 * insert path (createSkill/createProject/createAgent) and the backfill script
 * each append -2, -3, … on top of this.
 */

export const SLUG_MAX_LENGTH = 60;

/**
 * Slugs that would be shadowed by a static route segment at the same level, or
 * are otherwise unsafe as a detail-page slug. Callers must suffix rather than
 * emit these verbatim.
 *
 * `topic` is real: src/app/skills/topic/[slug]/page.tsx sits beside
 * src/app/skills/[slug], and Next resolves the static segment first, so a skill
 * slugged "topic" would be permanently unreachable. Applied on all four
 * surfaces rather than just /skills — the cost is one suffixed slug and it
 * removes the "which surface was this again?" question from every future edit.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(["topic"]);

/**
 * Danish letters fold to their conventional two-letter transliteration rather
 * than to bare a/o. Stripping the diacritic instead would turn "Ø-analyse" into
 * "-analyse" territory and collapse distinct Danish words onto each other.
 * Applied before the generic diacritic strip below, which would otherwise eat
 * the ring on "å" and yield "a".
 */
const DANISH_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/æ/g, "ae"],
  [/ø/g, "oe"],
  [/å/g, "aa"],
];

/**
 * Deterministic 32-bit hash (djb2), hex-encoded. Only used to build the
 * fallback slug for a title with no ASCII-mappable characters, where the
 * alternative is an empty slug and a URL of "/skills/".
 */
function hashHex(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function slugify(title: string): string {
  const folded = DANISH_FOLDS.reduce(
    // NFC first: an input already in decomposed form spells "å" as a + U+030A,
    // which the fold regex would miss and the diacritic strip would flatten to "a".
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    (title ?? "").normalize("NFC").toLowerCase()
  );

  const ascii = folded
    // Strip remaining diacritics (é → e, ü → u) by decomposing and dropping
    // the combining marks.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Everything that isn't a-z0-9 becomes a separator, underscores included.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!ascii) {
    // Non-empty and distinct per title, so two untranslatable titles don't
    // collapse onto one slug and then race for the unique index.
    return `item-${hashHex(title ?? "")}`;
  }

  if (ascii.length <= SLUG_MAX_LENGTH) return ascii;

  const cut = ascii.slice(0, SLUG_MAX_LENGTH);
  // Cutting mid-word produces a slug that reads like a typo, so back up to the
  // last hyphen — unless the cap landed exactly on one (the word is already
  // whole) or the whole thing is one unbroken word (nothing to back up to, so
  // the hard cap stands rather than returning "").
  const atBoundary = ascii[SLUG_MAX_LENGTH] === "-";
  const lastHyphen = cut.lastIndexOf("-");
  const trimmed = atBoundary || lastHyphen <= 0 ? cut : cut.slice(0, lastHyphen);

  return trimmed.replace(/-+$/, "");
}

/**
 * First free slug for `title`, given the slugs already taken.
 *
 * Lives here rather than in scripts/backfill-slugs.mjs so the collision rules
 * are covered by src/lib/__tests__/slug.test.ts — the script cannot be unit
 * tested without a database, and "the second row gets -2" is exactly the kind
 * of rule that is wrong once and then permanently baked into indexed URLs.
 *
 * A reserved base is never offered bare; it goes straight to `-2`.
 *
 * Unbounded, unlike the insert path's 5-attempt cap in src/lib/db.ts: this runs
 * over a known row set with no concurrent writer, so there is no runaway to
 * guard against, and failing a backfill because six rows share a title would be
 * the worse outcome.
 */
export function nextFreeSlug(title: string, taken: ReadonlySet<string>): string {
  const base = slugify(title);
  let n = RESERVED_SLUGS.has(base) ? 2 : 1;
  for (;;) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
    n++;
  }
}
