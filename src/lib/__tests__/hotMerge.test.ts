import { describe, it, expect } from "vitest";
import {
  normalizeRepo,
  entryKey,
  rankEntries,
  mergeSources,
  matchToCatalog,
  buildBoard,
  inferSkillCategory,
  slugToTitle,
  provisionNewSkill,
  isPureLlmSkill,
  MIN_BOARD_SIZE,
  MAX_BOARD_SIZE,
  MAX_SKILLS_PER_AUTHOR,
  type SourceResult,
  type SourceEntry,
  type CatalogEntry,
} from "../hotMerge";

/**
 * The merge decides what the Hot board says, so these tests are the board's
 * actual quality bar. The failure modes that matter are not crashes: they are
 * a ranking that silently runs on one source, a board that guesses which skill
 * a source meant, and a short board that looks authoritative.
 */

const entry = (slug: string, repo: string | null, value: number) => ({ slug, repo, value });

describe("normalizeRepo", () => {
  it("extracts owner/name and lowercases it", () => {
    expect(normalizeRepo("https://github.com/Vercel-Labs/Skills")).toBe("vercel-labs/skills");
  });

  it("ignores deep paths, query strings and fragments", () => {
    expect(normalizeRepo("https://github.com/anthropics/skills/tree/main/x?tab=readme#top")).toBe(
      "anthropics/skills"
    );
  });

  it("strips a trailing .git", () => {
    expect(normalizeRepo("https://github.com/a/b.git")).toBe("a/b");
  });

  it("returns null for non-GitHub and empty input", () => {
    expect(normalizeRepo("https://gitlab.com/a/b")).toBeNull();
    expect(normalizeRepo("not a url")).toBeNull();
    expect(normalizeRepo(null)).toBeNull();
    expect(normalizeRepo(undefined)).toBeNull();
    expect(normalizeRepo("")).toBeNull();
  });
});

describe("entryKey", () => {
  it("qualifies by repo so a collection does not collapse into one entry", () => {
    const a = entryKey({ slug: "ce-plan", repo: "anthropics/skills" });
    const b = entryKey({ slug: "ce-work", repo: "anthropics/skills" });
    expect(a).not.toBe(b);
  });

  it("falls back to the bare slug when there is no repo", () => {
    expect(entryKey({ slug: "Find-Skills", repo: null })).toBe("find-skills");
  });
});

describe("rankEntries — deterministic ordering", () => {
  it("orders by value descending", () => {
    const ranked = rankEntries([entry("a", null, 5), entry("b", null, 90), entry("c", null, 20)]);
    expect(ranked.map((e) => e.slug)).toEqual(["b", "c", "a"]);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("breaks ties on key, not on input order, so two runs agree", () => {
    // Ties are the normal case: star deltas of zero, rounded install counts.
    const forward = rankEntries([entry("zeta", null, 7), entry("alpha", null, 7)]);
    const reverse = rankEntries([entry("alpha", null, 7), entry("zeta", null, 7)]);
    expect(forward.map((e) => e.slug)).toEqual(["alpha", "zeta"]);
    expect(forward.map((e) => e.slug)).toEqual(reverse.map((e) => e.slug));
  });

  it("does not mutate its input", () => {
    const input = [entry("a", null, 1), entry("b", null, 2)];
    const before = input.map((e) => e.slug).join(",");
    rankEntries(input);
    expect(input.map((e) => e.slug).join(",")).toBe(before);
  });
});

describe("mergeSources", () => {
  const skillsSh = (entries: SourceEntry[]): SourceResult => ({
    source: "skills.sh",
    weight: 3,
    entries,
  });
  const stars = (entries: SourceEntry[]): SourceResult => ({
    source: "github-stars",
    weight: 2,
    entries,
  });
  const hn = (entries: SourceEntry[]): SourceResult => ({
    source: "hacker-news",
    weight: 1,
    entries,
  });

  it("puts an entry ranked highly by several sources above one ranked highly by only the strongest", () => {
    const report = mergeSources([
      skillsSh([entry("solo", "o/r", 100), entry("consensus", "o/r", 90)]),
      stars([entry("consensus", "o/r", 50)]),
      hn([entry("consensus", "o/r", 400)]),
    ]);
    expect(report.ranked[0].slug).toBe("consensus");
  });

  it("respects weight: the heaviest source wins a straight disagreement", () => {
    const report = mergeSources([
      skillsSh([entry("heavy", "o/r", 10)]),
      hn([entry("light", "o/r", 10)]),
    ]);
    expect(report.ranked.map((r) => r.slug)).toEqual(["heavy", "light"]);
  });

  it("records every source that ranked an entry, with its rank and raw value", () => {
    const report = mergeSources([
      skillsSh([entry("x", "o/r", 100)]),
      stars([entry("x", "o/r", 12)]),
    ]);
    expect(report.ranked[0].contributions).toEqual([
      { source: "skills.sh", rank: 1, value: 100 },
      { source: "github-stars", rank: 1, value: 12 },
    ]);
  });

  it("drops a failed source, reports why, and redistributes its weight", () => {
    const report = mergeSources([
      skillsSh([entry("a", "o/r", 1)]),
      { source: "github-stars", weight: 2, entries: [], error: "HTTP 500" },
    ]);
    expect(report.dropped).toEqual([{ source: "github-stars", reason: "HTTP 500" }]);
    // The survivor carries the full weight rather than a silently scaled-down share.
    expect(report.used).toEqual([{ source: "skills.sh", weight: 1, count: 1 }]);
  });

  it("treats an empty-but-successful source as dropped, not as agreement", () => {
    const report = mergeSources([skillsSh([entry("a", "o/r", 1)]), stars([])]);
    expect(report.dropped).toEqual([{ source: "github-stars", reason: "returned no entries" }]);
  });

  it("returns nothing when every source failed", () => {
    const report = mergeSources([
      { source: "skills.sh", weight: 3, entries: [], error: "HTTP 503" },
      { source: "hacker-news", weight: 1, entries: [], error: "timeout" },
    ]);
    expect(report.ranked).toEqual([]);
    expect(report.used).toEqual([]);
    expect(report.dropped).toHaveLength(2);
  });

  it("never emits NaN when every weight is zero", () => {
    const report = mergeSources([
      { source: "a", weight: 0, entries: [entry("x", null, 1)] },
      { source: "b", weight: 0, entries: [entry("y", null, 1)] },
    ]);
    expect(report.ranked.every((r) => Number.isFinite(r.score))).toBe(true);
  });

  it("is deterministic: the same input twice gives byte-identical output", () => {
    const build = () =>
      mergeSources([
        skillsSh([entry("a", "o/r", 5), entry("b", "o/r", 5)]),
        stars([entry("b", "o/r", 5), entry("a", "o/r", 5)]),
      ]);
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("keeps a url and repo learned from a later source", () => {
    const report = mergeSources([
      hn([{ slug: "x", repo: null, value: 300 }]),
      skillsSh([{ slug: "x", repo: null, value: 10, url: "https://skills.sh/x" }]),
    ]);
    expect(report.ranked[0].url).toBe("https://skills.sh/x");
  });
});

describe("matchToCatalog", () => {
  const catalog: CatalogEntry[] = [
    { id: "s1", slug: "find-skills", title: "find-skills", repo: "vercel-labs/skills" },
    { id: "s2", slug: "ce-plan", title: "ce-plan", repo: "anthropics/skills" },
    { id: "s3", slug: "ce-work", title: "ce-work", repo: "anthropics/skills" },
    { id: "s4", slug: "unique-thing", title: "unique-thing", repo: null },
  ];

  const rank = (slug: string, repo: string | null) =>
    mergeSources([{ source: "s", weight: 1, entries: [{ slug, repo, value: 1 }] }]).ranked;

  it("matches on repo and slug together", () => {
    const { matched } = matchToCatalog(rank("ce-work", "anthropics/skills"), catalog);
    expect(matched.map((m) => m.catalog.id)).toEqual(["s3"]);
  });

  it("does not let a shared repo match the wrong skill in a collection", () => {
    const { matched, unmatched } = matchToCatalog(rank("ce-absent", "anthropics/skills"), catalog);
    expect(matched).toEqual([]);
    expect(unmatched.map((u) => u.slug)).toEqual(["ce-absent"]);
  });

  it("falls back to a slug-only match when exactly one row owns that slug", () => {
    const { matched } = matchToCatalog(rank("unique-thing", null), catalog);
    expect(matched.map((m) => m.catalog.id)).toEqual(["s4"]);
  });

  it("declines to guess when a slug is ambiguous", () => {
    const ambiguous: CatalogEntry[] = [
      { id: "a", slug: "shared", title: "shared", repo: "x/one" },
      { id: "b", slug: "shared", title: "shared", repo: "y/two" },
    ];
    const { matched, unmatched } = matchToCatalog(rank("shared", null), ambiguous);
    expect(matched).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });

  it("reports hot entries the catalog does not carry instead of inventing them", () => {
    const ranked = mergeSources([
      {
        source: "s",
        weight: 1,
        entries: [entry("find-skills", "vercel-labs/skills", 9), entry("brand-new", "who/what", 8)],
      },
    ]).ranked;
    const { matched, unmatched } = matchToCatalog(ranked, catalog);
    expect(matched.map((m) => m.catalog.id)).toEqual(["s1"]);
    expect(unmatched.map((u) => u.slug)).toEqual(["brand-new"]);
  });

  it("never puts one catalog row in two positions", () => {
    const ranked = mergeSources([
      {
        source: "s",
        weight: 1,
        entries: [entry("unique-thing", null, 9), entry("unique-thing", "some/repo", 8)],
      },
    ]).ranked;
    const { matched } = matchToCatalog(ranked, catalog);
    expect(matched.filter((m) => m.catalog.id === "s4")).toHaveLength(1);
  });

  it("preserves ranking order in the matched list", () => {
    const ranked = mergeSources([
      {
        source: "s",
        weight: 1,
        entries: [entry("ce-work", "anthropics/skills", 9), entry("find-skills", "vercel-labs/skills", 8)],
      },
    ]).ranked;
    const { matched } = matchToCatalog(ranked, catalog);
    expect(matched.map((m) => m.catalog.id)).toEqual(["s3", "s1"]);
  });
});

describe("buildBoard", () => {
  const matchedOf = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      entry: {
        key: `k${i}`,
        slug: `s${i}`,
        repo: null,
        score: 1 / (i + 1),
        contributions: [],
      },
      catalog: { id: `id${i}`, slug: `s${i}`, title: `s${i}`, repo: null },
    }));

  it("proposes no board below the floor, with a reason", () => {
    const result = buildBoard(matchedOf(MIN_BOARD_SIZE - 1));
    expect(result.board).toBeNull();
    expect(result.reason).toContain(String(MIN_BOARD_SIZE));
  });

  it("proposes a board exactly at the floor", () => {
    expect(buildBoard(matchedOf(MIN_BOARD_SIZE)).board).toHaveLength(MIN_BOARD_SIZE);
  });

  it("cuts the tail at the ceiling", () => {
    expect(buildBoard(matchedOf(40)).board).toHaveLength(MAX_BOARD_SIZE);
  });

  it("numbers positions from 1 in ranking order", () => {
    const board = buildBoard(matchedOf(6)).board!;
    expect(board.map((b) => b.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(board[0].catalog.id).toBe("id0");
  });

  it("proposes nothing at all from an empty match list", () => {
    expect(buildBoard([]).board).toBeNull();
  });

  it("auto-provisions new skills when ranked entries are not in catalog", () => {
    const ranked = Array.from({ length: 10 }, (_, i) => ({
      key: `owner-${i}/repo#skill-${i}`,
      slug: `skill-${i}`,
      repo: `owner-${i}/repo`,
      score: 1 / (i + 1),
      contributions: [],
    }));
    const catalog: CatalogEntry[] = [
      { id: "s1", slug: "skill-0", title: "Skill 0", repo: "owner-0/repo" },
    ];

    const result = buildBoard(ranked, catalog);
    expect(result.board).toHaveLength(10);
    expect(result.board![0].catalog.id).toBe("s1");
    expect(result.board![0].isNew).toBe(false);
    expect(result.board![1].catalog.id).toBe("new:skill-1");
    expect(result.board![1].isNew).toBe(true);
    expect(result.newSkills).toHaveLength(9);
  });

  it("enforces MAX_SKILLS_PER_AUTHOR = 3 to guarantee creator diversity", () => {
    const ranked = Array.from({ length: 10 }, (_, i) => ({
      key: `same-creator/skills#tool-${i}`,
      slug: `tool-${i}`,
      repo: "same-creator/skills",
      score: 1 / (i + 1),
      contributions: [],
    }));
    // Add other creators to clear the floor
    for (let i = 0; i < 5; i++) {
      ranked.push({
        key: `other-${i}/skills#other-tool-${i}`,
        slug: `other-tool-${i}`,
        repo: `other-${i}/skills`,
        score: 0.01 / (i + 1),
        contributions: [],
      });
    }

    const result = buildBoard(ranked, []);
    const sameCreatorCount = result.board!.filter(
      (b) => b.entry.repo === "same-creator/skills"
    ).length;
    expect(sameCreatorCount).toBe(MAX_SKILLS_PER_AUTHOR);
    expect(sameCreatorCount).toBe(3);
  });

  it("filters out non-LLM tools (e.g. orca-cli, traceknot, turborepo, genmedia-labs)", () => {
    const ranked = [
      { key: "genmedia-labs/skills#ai-music", slug: "ai-music", repo: "genmedia-labs/skills", score: 0.95, contributions: [] },
      { key: "stablyai/orca#orca-cli", slug: "orca-cli", repo: "stablyai/orca", score: 0.90, contributions: [] },
      { key: "jin-doh/traceknot#traceknot", slug: "traceknot", repo: "jin-doh/traceknot", score: 0.85, contributions: [] },
      { key: "vercel/turborepo#turborepo", slug: "turborepo", repo: "vercel/turborepo", score: 0.80, contributions: [] },
      { key: "vercel-labs/agent-skills#vercel-optimize", slug: "vercel-optimize", repo: "vercel-labs/agent-skills", score: 0.75, contributions: [] },
      ...Array.from({ length: 6 }, (_, i) => ({
        key: `creator-${i}/skills#tool-${i}`,
        slug: `tool-${i}`,
        repo: `creator-${i}/skills`,
        score: 0.5 - i * 0.05,
        contributions: [],
      })),
    ];

    const result = buildBoard(ranked, []);
    expect(result.board).toHaveLength(6);
    expect(result.board!.some((b) => b.entry.slug === "orca-cli")).toBe(false);
    expect(result.board!.some((b) => b.entry.slug === "traceknot")).toBe(false);
    expect(result.board!.some((b) => b.entry.slug === "turborepo")).toBe(false);
    expect(result.board!.some((b) => b.entry.slug === "vercel-optimize")).toBe(false);
  });

  it("attaches authentic custom descriptions when descriptionsMap is provided", () => {
    const ranked = Array.from({ length: 6 }, (_, i) => ({
      key: `creator-${i}/skills#skill-${i}`,
      slug: `skill-${i}`,
      repo: `creator-${i}/skills`,
      score: 1 / (i + 1),
      contributions: [],
    }));
    const descriptionsMap = new Map([
      ["creator-0/skills#skill-0", "A relentless interview to sharpen a plan or design."],
      ["creator-1/skills#skill-1", "Test-driven development loop for building robust features."],
    ]);

    const result = buildBoard(ranked, [], descriptionsMap);
    expect(result.board![0].catalog.description).toBe("A relentless interview to sharpen a plan or design.");
    expect(result.board![1].catalog.description).toBe("Test-driven development loop for building robust features.");
    expect(result.board![2].catalog.description).toContain("Skill 2 workflow and prompt instructions");
  });
});

describe("inferSkillCategory & slugToTitle & provisionNewSkill & isPureLlmSkill", () => {
  it("converts slugs into readable titles with acronym recognition", () => {
    expect(slugToTitle("ai-music-generator")).toBe("AI Music Generator");
    expect(slugToTitle("seo-audit-tool")).toBe("SEO Audit Tool");
    expect(slugToTitle("neon-postgres-client")).toBe("Neon Postgres Client");
  });

  it("correctly infers taxonomy topics from keywords", () => {
    expect(inferSkillCategory("gdpr-cookie-consent")).toBe("compliance");
    expect(inferSkillCategory("tailwind-theme-generator")).toBe("design-ux");
    expect(inferSkillCategory("react-flow-renderer")).toBe("frontend-ui");
    expect(inferSkillCategory("supabase-postgres-admin")).toBe("backend-data");
    expect(inferSkillCategory("ai-video-editor")).toBe("growth-content");
    expect(inferSkillCategory("pubmed-research-fetcher")).toBe("domain-data");
    expect(inferSkillCategory("zsh-command-runner")).toBe("cli");
    expect(inferSkillCategory("turborepo-monorepo-build")).toBe("fullstack-devops");
  });

  it("identifies non-LLM tools and pure LLM skills correctly", () => {
    // Non-LLM tools
    expect(isPureLlmSkill({ repo: "genmedia-labs/skills", slug: "ai-music" })).toBe(false);
    expect(isPureLlmSkill({ repo: "skills-101/superpowers", slug: "ai-video-generation" })).toBe(false);
    expect(isPureLlmSkill({ slug: "orca-cli" })).toBe(false);
    expect(isPureLlmSkill({ repo: "jin-doh/traceknot", slug: "traceknot" })).toBe(false);
    expect(isPureLlmSkill({ slug: "turborepo" })).toBe(false);
    expect(isPureLlmSkill({ slug: "vercel-optimize" })).toBe(false);
    expect(isPureLlmSkill({ slug: "lark-im" })).toBe(false);

    // Pure Claude/LLM skills
    expect(isPureLlmSkill({ repo: "mattpocock/skills", slug: "grill-me" })).toBe(true);
    expect(isPureLlmSkill({ repo: "mattpocock/skills", slug: "tdd" })).toBe(true);
    expect(isPureLlmSkill({ repo: "mattpocock/skills", slug: "ponytail" })).toBe(true);
    expect(isPureLlmSkill({ repo: "heygen-com/hyperframes", slug: "product-launch-video" })).toBe(true);
    expect(isPureLlmSkill({ repo: "jakubkrehel/skills", slug: "better-typography" })).toBe(true);
    expect(isPureLlmSkill({ repo: "juliusbrussee/caveman", slug: "cavecrew" })).toBe(true);
  });

  it("provisions a complete new catalog entry structure with custom description", () => {
    const entry = {
      key: "heygen-com/hyperframes#product-launch-video",
      slug: "product-launch-video",
      repo: "heygen-com/hyperframes",
      url: "https://github.com/heygen-com/hyperframes",
      score: 0.05,
      contributions: [],
    };
    const provisioned = provisionNewSkill(entry, "Turn a product URL into a launch promo video.");
    expect(provisioned.id).toBe("new:product-launch-video");
    expect(provisioned.title).toBe("Product Launch Video");
    expect(provisioned.category).toBe("growth-content");
    expect(provisioned.vibeCoder).toBe("heygen-com");
    expect(provisioned.githubUrl).toBe("https://github.com/heygen-com/hyperframes");
    expect(provisioned.description).toBe("Turn a product URL into a launch promo video.");
    expect(provisioned.isNew).toBe(true);
  });
});


