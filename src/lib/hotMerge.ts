// Merging several external rankings into one weekly Hot ordering.
//
// This module is deliberately import-free: scripts/scan-hot-skills.mjs loads it
// directly through Node's built-in TypeScript type stripping, and Node's ESM
// resolver would not follow an extensionless relative import from it. Same
// split as src/lib/epochId.ts and src/lib/githubDocSource.ts.
//
// Everything here is pure. Fetching lives in the script, so the part that
// decides what the board says is testable without a network.

/** One entry as a single source ranks it. */
export interface SourceEntry {
  /** Skill name as the source knows it (e.g. "find-skills"). */
  slug: string;
  /** Owning repo as "owner/name", lowercased, or null when the source has none. */
  repo: string | null;
  /**
   * Source-native magnitude, higher is better: weekly install delta, weekly
   * star delta, HN points. Only its ORDER is used (see rankEntries) — the
   * magnitudes are never compared across sources, because installs and
   * upvotes are not the same unit and pretending otherwise is how a merged
   * ranking starts quietly meaning nothing.
   */
  value: number;
  url?: string;
}

/** What one adapter returned, or why it returned nothing. */
export interface SourceResult {
  /** Stable id, e.g. "skills.sh". Appears in the manifest and the PR body. */
  source: string;
  /** Relative influence before redistribution. */
  weight: number;
  entries: SourceEntry[];
  /** Set when the adapter failed. `entries` must then be empty. */
  error?: string;
}

export interface MergedEntry {
  key: string;
  slug: string;
  repo: string | null;
  url?: string;
  /** Fused score, higher is better. Not a percentage and not comparable across runs. */
  score: number;
  /** Per-source rank (1-based) for everything that ranked this entry. */
  contributions: Array<{ source: string; rank: number; value: number }>;
}

export interface MergeReport {
  ranked: MergedEntry[];
  /** Sources that contributed, with the weight actually applied after redistribution. */
  used: Array<{ source: string; weight: number; count: number }>;
  /** Sources that returned nothing, with the reason. Surfaced in the PR body. */
  dropped: Array<{ source: string; reason: string }>;
}

/**
 * Reciprocal-rank-fusion damping constant.
 *
 * Standard RRF uses 60, which is tuned for search result lists thousands long
 * and deliberately flattens the top. Our lists are tens of entries, where 60
 * would make positions 1 and 10 nearly indistinguishable and the merge would
 * amount to "appeared in several lists at all". 10 keeps the top of each list
 * meaningfully ahead of its tail at this size.
 */
export const RRF_K = 10;

/** "owner/name" from a GitHub URL, lowercased, or null when it is not one. */
export function normalizeRepo(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/i.exec(url.trim());
  if (!match) return null;
  const owner = match[1].toLowerCase();
  const name = match[2].toLowerCase().replace(/\.git$/, "");
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

/**
 * Identity for an entry across sources.
 *
 * Repo-qualified where a repo is known, because a repo can hold many skills:
 * `anthropics/skills` alone would collapse a whole collection into one entry.
 * Bare slug otherwise, which is how Hacker News entries join — they carry a
 * story, not a repo.
 */
export function entryKey(entry: { slug: string; repo: string | null }): string {
  const slug = entry.slug.trim().toLowerCase();
  return entry.repo ? `${entry.repo}#${slug}` : slug;
}

/**
 * Order one source's entries by value, descending, deterministically.
 *
 * Ties break on key ascending rather than on input order, so two runs over the
 * same data produce byte-identical output even if the source reordered equal
 * values between calls. Equal values are common: install counts round, and
 * plenty of entries share a star delta of zero.
 */
export function rankEntries(entries: SourceEntry[]): Array<SourceEntry & { rank: number }> {
  return [...entries]
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return entryKey(a).localeCompare(entryKey(b));
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * Fuse the sources into one ordering.
 *
 * Weighted reciprocal rank fusion: an entry scores `weight / (RRF_K + rank)`
 * from each source that ranked it, summed. Rank rather than raw value, because
 * the values are in incompatible units.
 *
 * Failed sources are dropped and their weight is redistributed proportionally
 * across the survivors, so a run with two live sources is still a full-strength
 * ranking of those two rather than a ranking silently scaled down by a third.
 * The drop is reported, never swallowed: a board quietly running on one source
 * is exactly the failure this whole feature exists to stop repeating.
 */
export function mergeSources(results: SourceResult[]): MergeReport {
  const dropped: Array<{ source: string; reason: string }> = [];
  const live: SourceResult[] = [];

  for (const result of results) {
    if (result.error) {
      dropped.push({ source: result.source, reason: result.error });
    } else if (result.entries.length === 0) {
      dropped.push({ source: result.source, reason: "returned no entries" });
    } else {
      live.push(result);
    }
  }

  if (live.length === 0) {
    return { ranked: [], used: [], dropped };
  }

  const totalWeight = live.reduce((sum, r) => sum + r.weight, 0);
  // Guard against a caller passing all-zero weights: fall back to equal shares
  // rather than dividing by zero and emitting NaN scores.
  const share = (result: SourceResult) =>
    totalWeight > 0 ? result.weight / totalWeight : 1 / live.length;

  const merged = new Map<string, MergedEntry>();

  for (const result of live) {
    const weight = share(result);
    for (const entry of rankEntries(result.entries)) {
      const key = entryKey(entry);
      const existing = merged.get(key);
      const points = weight / (RRF_K + entry.rank);
      if (existing) {
        existing.score += points;
        existing.contributions.push({ source: result.source, rank: entry.rank, value: entry.value });
        // Keep the first non-empty url and repo we saw, so the manifest links
        // somewhere even when a later source knows less about the entry.
        if (!existing.url && entry.url) existing.url = entry.url;
        if (!existing.repo && entry.repo) existing.repo = entry.repo;
      } else {
        merged.set(key, {
          key,
          slug: entry.slug,
          repo: entry.repo,
          url: entry.url,
          score: points,
          contributions: [{ source: result.source, rank: entry.rank, value: entry.value }],
        });
      }
    }
  }

  const ranked = [...merged.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.key.localeCompare(b.key);
  });

  return {
    ranked,
    used: live.map((r) => ({ source: r.source, weight: share(r), count: r.entries.length })),
    dropped,
  };
}

/** A catalog row, reduced to what matching needs. */
export interface CatalogEntry {
  id: string;
  slug: string;
  title: string;
  repo: string | null;
}

export interface MatchReport {
  /** Merged entries paired with the catalog row they name, in ranking order. */
  matched: Array<{ entry: MergedEntry; catalog: CatalogEntry }>;
  /** Ranked entries the catalog does not carry. Reported, never inserted. */
  unmatched: MergedEntry[];
}

/**
 * Pair merged entries with catalog rows.
 *
 * Two passes, strictest first:
 *   1. repo + slug — the only unambiguous key when a repo holds many skills.
 *   2. slug alone, and only when exactly one catalog row has that slug.
 *
 * There is deliberately no fuzzy third pass. A near-match here puts the wrong
 * skill on the board under another skill's momentum, and the board's whole
 * claim is that a visitor could check why each entry is there.
 *
 * Adding catalog rows is out of scope by design: discovery and submission
 * already exist end to end (Hermes -> /api/agentauth -> submission-review.yml).
 * Unmatched entries go in the PR body for that pipeline to pick up.
 */
export function matchToCatalog(ranked: MergedEntry[], catalog: CatalogEntry[]): MatchReport {
  const byRepoSlug = new Map<string, CatalogEntry>();
  const bySlug = new Map<string, CatalogEntry[]>();

  for (const row of catalog) {
    for (const name of [row.slug, row.title]) {
      const slug = name?.trim().toLowerCase();
      if (!slug) continue;
      if (row.repo) {
        const key = `${row.repo}#${slug}`;
        if (!byRepoSlug.has(key)) byRepoSlug.set(key, row);
      }
      const list = bySlug.get(slug);
      if (list) {
        if (!list.some((r) => r.id === row.id)) list.push(row);
      } else {
        bySlug.set(slug, [row]);
      }
    }
  }

  const matched: MatchReport["matched"] = [];
  const unmatched: MergedEntry[] = [];
  const claimed = new Set<string>();

  for (const entry of ranked) {
    const slug = entry.slug.trim().toLowerCase();
    let hit: CatalogEntry | undefined;

    if (entry.repo) hit = byRepoSlug.get(`${entry.repo}#${slug}`);
    if (!hit) {
      const candidates = bySlug.get(slug);
      // Exactly one, or the slug is ambiguous and we decline to guess.
      if (candidates && candidates.length === 1) hit = candidates[0];
    }

    // One catalog row can only occupy one position.
    if (hit && !claimed.has(hit.id)) {
      claimed.add(hit.id);
      matched.push({ entry, catalog: hit });
    } else if (!hit) {
      unmatched.push(entry);
    }
  }

  return { matched, unmatched };
}

/** Fewer matched entries than this and no ranking is proposed at all. */
export const MIN_BOARD_SIZE = 5;
/**
 * More than this and the tail is cut.
 *
 * Raised from 10 to 20 deliberately. Note the tension it creates: against a
 * ~99-entry catalog, a full board is a fifth of everything on the site, and the
 * further down the leaderboard an entry sits the smaller its weekly delta, so
 * the bottom of a 20-row board is separated from the unranked by very little.
 * The floor stays at 5 so a thin week still proposes nothing rather than
 * padding itself, and the per-row source columns in the manifest show exactly
 * how much signal each position actually has before anyone merges it.
 */
export const MAX_BOARD_SIZE = 20;

export interface BoardResult {
  /** The board, or null when the floor was not met. */
  board: Array<{ position: number; catalog: CatalogEntry; entry: MergedEntry }> | null;
  reason?: string;
}

/**
 * Cut the matched list to a board.
 *
 * Returning null rather than a short board is the point: five entries is the
 * floor at which an ordering is worth publishing, and proposing a two-entry
 * "Hotteste globalt" would be the frozen-snapshot problem in a new costume.
 * The read path independently refuses to render a stale board, so a week that
 * produces nothing simply leaves the previous one to expire.
 */
export function buildBoard(matched: MatchReport["matched"]): BoardResult {
  if (matched.length < MIN_BOARD_SIZE) {
    return {
      board: null,
      reason: `only ${matched.length} matched catalog entries, floor is ${MIN_BOARD_SIZE}`,
    };
  }
  return {
    board: matched.slice(0, MAX_BOARD_SIZE).map((m, i) => ({
      position: i + 1,
      catalog: m.catalog,
      entry: m.entry,
    })),
  };
}
