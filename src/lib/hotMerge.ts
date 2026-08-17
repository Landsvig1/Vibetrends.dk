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

/**
 * Infer the best taxonomy topic from slug, description, and repo keywords.
 */
export function inferSkillCategory(
  slug: string,
  description: string = "",
  repo: string = ""
): string {
  const text = `${slug} ${description} ${repo}`.toLowerCase();

  if (/\b(gdpr|privacy|cookie|compliance|security|auth|governance|legal|policy|audit)\b/.test(text)) {
    return "compliance";
  }
  if (/\b(design|ui[/-]ux|palette|theme|aesthetic|layout|tailwind|styling|figma|css|font|canvas)\b/.test(text)) {
    return "design-ux";
  }
  if (/\b(frontend|react|vue|svelte|nextjs|component|animation|framer|browser|web-design)\b/.test(text)) {
    return "frontend-ui";
  }
  if (/\b(db|database|sql|postgres|supabase|neon|redis|api|orm|query|storage|mongo|backend)\b/.test(text)) {
    return "backend-data";
  }
  if (/\b(seo|marketing|growth|content|copy|copywriting|social|reddit|youtube|video|music|email|sales|outreach|media|brand)\b/.test(text)) {
    return "growth-content";
  }
  if (/\b(research|scraper|scrape|crawl|search|finance|pubmed|property|weather|travel|news)\b/.test(text)) {
    return "domain-data";
  }
  if (/\b(cli|terminal|shell|bash|git|command|tmux|zsh|prompt)\b/.test(text)) {
    return "cli";
  }
  return "fullstack-devops";
}

/** Convert a kebab-case slug into a clean title. */
export function slugToTitle(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (["ai", "ui", "ux", "seo", "geo", "db", "api", "cli", "pr", "tdd", "hn"].includes(lower)) {
        return lower.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** A catalog row, reduced to what matching needs. */
export interface CatalogEntry {
  id: string;
  slug: string;
  title: string;
  repo: string | null;
  isNew?: boolean;
  category?: string;
  description?: string;
  githubUrl?: string;
  source?: string;
  vibeCoder?: string;
  tags?: string[];
}

export interface MatchReport {
  /** Merged entries paired with the catalog row they name, in ranking order. */
  matched: Array<{ entry: MergedEntry; catalog: CatalogEntry }>;
  /** Ranked entries the catalog does not carry. */
  unmatched: MergedEntry[];
}

/**
 * Pair merged entries with catalog rows.
 *
 * Two passes, strictest first:
 *   1. repo + slug — the only unambiguous key when a repo holds many skills.
 *   2. slug alone, and only when exactly one catalog row has that slug.
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

/**
 * Auto-provision a new catalog entry structure for a trending skill not in the catalog.
 */
export function provisionNewSkill(entry: MergedEntry, customDescription?: string): CatalogEntry {
  const title = slugToTitle(entry.slug);
  const category = inferSkillCategory(entry.slug, "", entry.repo ?? undefined);
  const repoOwner = entry.repo ? entry.repo.split("/")[0] : "Community";
  const githubUrl = entry.repo ? `https://github.com/${entry.repo}` : entry.url;
  const source = entry.url || (entry.repo ? `https://github.com/${entry.repo}` : "skills.sh");
  const description =
    customDescription?.trim() ||
    `${title} workflow and prompt instructions for Claude and AI coding agents.`;

  return {
    id: `new:${entry.slug}`,
    slug: entry.slug,
    title,
    repo: entry.repo,
    isNew: true,
    category,
    description,
    githubUrl,
    source,
    vibeCoder: repoOwner,
    tags: [entry.slug, category, "hot"],
  };
}

/**
 * Known tools and patterns that are NOT pure Claude/LLM prompt & workflow skills.
 *
 * Excludes:
 * 1. Platform-locked tools requiring external compute or proprietary servers (RunComfy, ComfyUI, StablyAI).
 * 2. Standalone OS CLI binaries, daemons, terminal apps (Orca CLI, Traceknot, Tmux).
 * 3. Build systems, bundlers, compilers, infra toolchains (Turborepo, Webpack, Vite plugins).
 * 4. Cloud provider / hosting deploy CLIs (Vercel Optimize/deploy CLI wrappers).
 * 5. Proprietary enterprise office suites (Lark).
 */
export const NON_LLM_TOOL_PATTERNS = [
  /genmedia-labs/i,
  /runcomfy/i,
  /comfyui/i,
  /stablyai/i,
  /orca(-cli)?\b/i,
  /traceknot/i,
  /turborepo/i,
  /vercel-optimize/i,
  /\blark[-_]/i,
  /\b(tmux|daemon|webpack|vite-plugin|rollup)\b/i,
];

export const PLATFORM_LOCKED_PATTERNS = NON_LLM_TOOL_PATTERNS;

/**
 * Returns true if the entry is a pure LLM skill (prompts, markdown instructions,
 * agent personas, workflow loops) workable directly by Claude without external CLI binaries.
 */
export function isPureLlmSkill(entry: { slug?: string; repo?: string | null; url?: string; title?: string }): boolean {
  const text = `${entry.slug ?? ""} ${entry.repo ?? ""} ${entry.url ?? ""} ${entry.title ?? ""}`.toLowerCase();
  return !NON_LLM_TOOL_PATTERNS.some((pattern) => pattern.test(text));
}

export function isPlatformLocked(entry: { slug?: string; repo?: string | null; url?: string }): boolean {
  return !isPureLlmSkill(entry);
}

/** Fewer ranked entries than this and no ranking is proposed at all. */
export const MIN_BOARD_SIZE = 5;
/**
 * More than this and the tail is cut.
 */
export const MAX_BOARD_SIZE = 20;

/** Max skills from a single repo / creator on the board to guarantee creator diversity. */
export const MAX_SKILLS_PER_AUTHOR = 3;

export interface BoardItem {
  position: number;
  catalog: CatalogEntry;
  entry: MergedEntry;
  isNew: boolean;
}

export interface BoardResult {
  /** The board, or null when the floor was not met. */
  board: BoardItem[] | null;
  newSkills: CatalogEntry[];
  reason?: string;
}

/**
 * Build the Hot board from the ranked entries and existing catalog.
 *
 * Top ranked entries enter the board up to MAX_BOARD_SIZE. If an entry matches
 * an existing catalog row, it links to it; if not, a new skill entry is
 * provisioned so the weekly scan introduces new trending skills to the catalog.
 *
 * Excludes non-LLM tools and caps max skills per author/repo at MAX_SKILLS_PER_AUTHOR (3).
 */
export function buildBoard(
  rankedOrMatched: MergedEntry[] | MatchReport["matched"],
  catalog?: CatalogEntry[],
  descriptionsMap?: Map<string, string>
): BoardResult {
  // Backwards compatibility if called with matched report array
  if (Array.isArray(rankedOrMatched) && rankedOrMatched.length > 0 && "catalog" in rankedOrMatched[0]) {
    const matched = rankedOrMatched as MatchReport["matched"];
    const filtered = matched.filter((m) => isPureLlmSkill(m.entry));
    if (filtered.length < MIN_BOARD_SIZE) {
      return {
        board: null,
        newSkills: [],
        reason: `only ${filtered.length} entries after filtering, floor is ${MIN_BOARD_SIZE}`,
      };
    }
    const board = filtered.slice(0, MAX_BOARD_SIZE).map((m, i) => ({
      position: i + 1,
      catalog: m.catalog,
      entry: m.entry,
      isNew: Boolean(m.catalog.isNew),
    }));
    const newSkills = board.filter((b) => b.isNew).map((b) => b.catalog);
    return { board, newSkills };
  }

  const ranked = rankedOrMatched as MergedEntry[];
  if (!ranked || ranked.length < MIN_BOARD_SIZE) {
    return {
      board: null,
      newSkills: [],
      reason: `only ${ranked?.length ?? 0} ranked entries, floor is ${MIN_BOARD_SIZE}`,
    };
  }

  const catalogList = catalog ?? [];
  const matchReport = matchToCatalog(ranked, catalogList);
  const matchedMap = new Map<string, CatalogEntry>();
  for (const m of matchReport.matched) {
    matchedMap.set(m.entry.key, m.catalog);
  }

  const boardItems: BoardItem[] = [];
  const newSkills: CatalogEntry[] = [];
  const claimedIds = new Set<string>();
  const authorCounts = new Map<string, number>();

  for (const entry of ranked) {
    if (boardItems.length >= MAX_BOARD_SIZE) break;
    if (!isPureLlmSkill(entry)) continue;

    const existing = matchedMap.get(entry.key);
    const authorKey = (entry.repo || existing?.repo || existing?.vibeCoder || entry.slug).toLowerCase();
    const currentAuthorCount = authorCounts.get(authorKey) || 0;

    // Enforce author diversity cap
    if (currentAuthorCount >= MAX_SKILLS_PER_AUTHOR) continue;

    if (existing) {
      if (claimedIds.has(existing.id)) continue;
      claimedIds.add(existing.id);
      authorCounts.set(authorKey, currentAuthorCount + 1);
      boardItems.push({
        position: boardItems.length + 1,
        catalog: existing,
        entry,
        isNew: false,
      });
    } else {
      const customDesc = descriptionsMap?.get(entry.key) || descriptionsMap?.get(entry.slug);
      const newEntry = provisionNewSkill(entry, customDesc);
      if (claimedIds.has(newEntry.slug)) continue;
      claimedIds.add(newEntry.slug);
      authorCounts.set(authorKey, currentAuthorCount + 1);
      boardItems.push({
        position: boardItems.length + 1,
        catalog: newEntry,
        entry,
        isNew: true,
      });
      newSkills.push(newEntry);
    }
  }

  if (boardItems.length < MIN_BOARD_SIZE) {
    return {
      board: null,
      newSkills: [],
      reason: `only ${boardItems.length} board entries, floor is ${MIN_BOARD_SIZE}`,
    };
  }

  return { board: boardItems, newSkills };
}


