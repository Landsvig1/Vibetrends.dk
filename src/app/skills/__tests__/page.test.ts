import { describe, it, expect, vi, beforeEach } from "vitest";
import { slugify } from "@/lib/slug";

/**
 * U5 — server component tests for /skills page.tsx.
 *
 * Mirrors the shape of src/app/vibes/__tests__/page.test.ts (U4).
 *
 * These tests verify two things:
 *  1. The server component passes real skill data (not empty arrays) to the
 *     client island — this is the core crawlability/SSR assertion.
 *  2. The JSON-LD ItemList generated server-side reflects the fetched skills,
 *     not the empty list the previous client-state-based approach produced.
 *
 * We test SkillsPageContent (the inner async component) directly rather than
 * through the outer Suspense shell — the shell adds no data logic of its own.
 *
 * SkillsExplorer and loading.tsx are mocked to keep tests hermetic.
 */

// -- mocks must be declared before any import that triggers the mocked module --

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(),
}));

vi.mock("@/lib/jsonLd", () => ({
  jsonLdScript: (data: unknown) => JSON.stringify(data),
  skillsListJsonLd: (
    skills: { title: string; description: string; vibeCoder: string }[],
    name: string,
    description: string,
  ) => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: skills.length,
    itemListElement: skills.map((skill, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "SoftwareSourceCode",
        name: skill.title,
        description: skill.description,
        author: { "@type": "Person", name: skill.vibeCoder },
      },
    })),
  }),
}));

// Stub the client island — it receives initialAllSkills but we don't render it.
vi.mock("../SkillsExplorer", () => ({
  default: () => null,
}));

vi.mock("../loading", () => ({
  default: () => null,
}));

import { cookies } from "next/headers";
import { getSkills } from "@/lib/db";
import { SkillsPageContent, getValidView } from "../page";
import { SKILL_BOARDS, DEFAULT_SKILL_BOARD } from "@/lib/skillViews";
import { SKILL_CATEGORY_SLUGS } from "@/lib/skillCategories";
import { getElementWithProp, getJsonLd } from "@/test-utils/reactTree";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cookiesMock = vi.mocked(cookies);
const getSkillsMock = vi.mocked(getSkills);

/** Minimal Skill fixture. */
function makeSkill(id: string, title: string, description: string) {
  return {
    id,
    slug: slugify(title),
    title,
    description,
    vibeCoder: "alice",
    vibeCoderTitle: "Vibe Coder",
    category: "frontend" as const,
    categoryLabel: "Frontend",
    rating: 4.5,
    reviewsCount: 10,
    upvotes: 0,
    tags: [],
    githubUrl: "https://github.com/alice/skill",
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Cookie mock retained for module isolation; page no longer reads it.
  cookiesMock.mockResolvedValue({
    get: () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  getSkillsMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// getValidView — pure helper
// ---------------------------------------------------------------------------

describe("getValidView", () => {
  // The Danish default is a site-wide convention: /vibes, /cli, /mcp and
  // /forum all open on the Danish board. This hub must not drift off it on
  // its own — the "only 45 of 98 are on the default board" problem is solved
  // by printing each board's count on its tab, not by reordering the boards.
  it("defaults to 'danish', matching every other hub", () => {
    expect(getValidView(undefined)).toBe("danish");
  });
  it("returns 'danish' for unknown values", () => {
    expect(getValidView("popular")).toBe("danish");
    expect(getValidView("")).toBe("danish");
  });
  it("returns 'danish' when given 'danish'", () => {
    expect(getValidView("danish")).toBe("danish");
  });
  it("returns 'trending' when given 'trending'", () => {
    expect(getValidView("trending")).toBe("trending");
  });
  it("returns 'all' when given 'all'", () => {
    expect(getValidView("all")).toBe("all");
  });
  // 'hot' is a real getSkills board and stays on /api/skills and the MCP tool,
  // but no tab on this page surfaces it: ?view=hot used to render rows with
  // every tab reading inactive and no control to get back out of it.
  it("folds the tab-less 'hot' board to the default", () => {
    expect(getValidView("hot")).toBe("danish");
  });
});

describe("SKILL_BOARDS — cross-hub consistency", () => {
  it("orders the tabs Dansk first, then Alle, like /vibes and /cli", () => {
    expect([...SKILL_BOARDS]).toEqual(["danish", "all", "trending"]);
    expect(DEFAULT_SKILL_BOARD).toBe("danish");
    expect(SKILL_BOARDS[0]).toBe(DEFAULT_SKILL_BOARD);
  });
});

// ---------------------------------------------------------------------------
// SkillsPageContent — data-fetch call contract
// ---------------------------------------------------------------------------

describe("SkillsPageContent — data-fetch call contract", () => {
  it("fetches the whole catalog plus both boards, unfiltered, regardless of ?view=", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({
      searchParams: Promise.resolve({ view: "danish" }),
    });

    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "da");
    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "da", "danish");
    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "da", "trending");
    expect(getSkillsMock).toHaveBeenCalledTimes(3);
  });

  it("issues the same three reads on the default view", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({ searchParams: Promise.resolve({}) });

    expect(getSkillsMock).toHaveBeenCalledTimes(3);
    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "da");
  });

  /**
   * The catalog read must NOT carry ?q=. It used to, which meant the client
   * island received an empty catalog on any URL with a search term — so the
   * zero-results state lost its suggestions on exactly the URLs people share
   * and reload. Search runs client-side in filterSkills() against this list.
   */
  it("never passes ?q= to the catalog read", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({
      searchParams: Promise.resolve({ q: "react" }),
    });

    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "da");
    expect(getSkillsMock).not.toHaveBeenCalledWith("react", undefined, "da", "danish");
  });

  it("adds one search-filtered read when ?q= is set, for the JSON-LD only", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({
      searchParams: Promise.resolve({ q: "react" }),
    });

    expect(getSkillsMock).toHaveBeenCalledWith("react", undefined, "da");
    expect(getSkillsMock).toHaveBeenCalledTimes(4);
  });

  it("treats an empty q as no search, so no extra read is issued", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({
      searchParams: Promise.resolve({ q: "" }),
    });

    expect(getSkillsMock).toHaveBeenCalledTimes(3);
    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "da");
  });
});

// ---------------------------------------------------------------------------
// SkillsPageContent — JSON-LD server-side generation (core SEO assertion)
// ---------------------------------------------------------------------------

describe("SkillsPageContent — JSON-LD is built from server-fetched data, not empty state", () => {
  it("JSON-LD numberOfItems matches the number of fetched skills", async () => {
    const skills = [
      makeSkill("s1", "Skill One", "Description for skill one"),
      makeSkill("s2", "Skill Two", "Description for skill two"),
    ];
    // First call (full catalog) returns the skills; second call (view board) returns same.
    getSkillsMock.mockResolvedValue(skills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    const jsonLd = getJsonLd(result);

    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.numberOfItems).toBe(2);
    expect(jsonLd.itemListElement).toHaveLength(2);
  });

  it("JSON-LD itemListElement entries include skill title and description", async () => {
    const skills = [makeSkill("s1", "My AI Skill", "A great AI skill")];
    getSkillsMock.mockResolvedValue(skills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    const jsonLd = getJsonLd(result);

    const firstItem = jsonLd.itemListElement[0];
    expect(firstItem.position).toBe(1);
    expect(firstItem.item["@type"]).toBe("SoftwareSourceCode");
    expect(firstItem.item.name).toBe("My AI Skill");
    expect(firstItem.item.description).toBe("A great AI skill");
  });

  it("JSON-LD has numberOfItems 0 and empty itemListElement when getSkills returns []", async () => {
    getSkillsMock.mockResolvedValue([]);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    const jsonLd = getJsonLd(result);

    expect(jsonLd.numberOfItems).toBe(0);
    expect(jsonLd.itemListElement).toHaveLength(0);
  });

  it("JSON-LD reflects search-filtered result when ?q= is present", async () => {
    // When ?q=react is in the URL, getSkills returns only matching skills.
    // The JSON-LD must be built from that filtered allSkills list.
    const filteredSkills = [
      makeSkill("s1", "React Hooks Guide", "A guide to React hooks"),
    ];
    getSkillsMock.mockResolvedValue(filteredSkills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({ q: "react" }),
    });

    const jsonLd = getJsonLd(result);

    expect(jsonLd.numberOfItems).toBe(1);
    expect(jsonLd.itemListElement).toHaveLength(1);
    expect(jsonLd.itemListElement[0].item.name).toBe("React Hooks Guide");
  });
});

// ---------------------------------------------------------------------------
// SkillsPageContent — SkillsExplorer receives initial skill lists (SSR content)
// ---------------------------------------------------------------------------

describe("SkillsPageContent — SkillsExplorer receives the fetched skill lists", () => {
  it("passes initialAllSkills to SkillsExplorer so SSR output contains real content", async () => {
    const allSkills = [
      makeSkill("s1", "Alpha Skill", "Alpha description here"),
      makeSkill("s2", "Beta Skill", "Beta description here"),
    ];
    // Both catalog and view-board calls return the same fixture for simplicity.
    getSkillsMock.mockResolvedValue(allSkills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    const explorerEl = getElementWithProp(result, "initialAllSkills");

    expect(explorerEl.props.initialAllSkills).toHaveLength(2);
    expect(explorerEl.props.initialAllSkills[0].title).toBe("Alpha Skill");
    expect(explorerEl.props.initialAllSkills[1].title).toBe("Beta Skill");
  });

  /**
   * Every board is handed over up front. That is what lets the client switch
   * tabs with no network round-trip and print a real count on each tab; the
   * page used to fetch a board per click, and the only failure handler was a
   * console.error behind an unchanged grid.
   */
  it("passes each board as its own prop", async () => {
    const danish = [makeSkill("s1", "Danish Skill", "A danish skill here")];
    const trending = [makeSkill("s2", "Trending Skill", "A trending skill")];
    const catalog = [...danish, ...trending, makeSkill("s3", "Other", "desc")];

    getSkillsMock.mockImplementation(
      async (_search?: string, _cat?: string, _lang?: string, view?: string) =>
        view === "danish" ? danish : view === "trending" ? trending : catalog,
    );

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    const explorerEl = getElementWithProp(result, "initialAllSkills");

    expect(explorerEl.props.initialAllSkills).toHaveLength(3);
    expect(explorerEl.props.initialDanishSkills).toHaveLength(1);
    expect(explorerEl.props.initialDanishSkills[0].title).toBe("Danish Skill");
    expect(explorerEl.props.initialTrendingSkills).toHaveLength(1);
    expect(explorerEl.props.initialTrendingSkills[0].title).toBe("Trending Skill");
  });

  it("hands the client the whole catalog even when ?q= is set", async () => {
    const catalog = [
      makeSkill("s1", "Alpha", "desc"),
      makeSkill("s2", "Beta", "desc"),
      makeSkill("s3", "Gamma", "desc"),
    ];
    getSkillsMock.mockImplementation(async (search?: string) =>
      search === undefined ? catalog : [catalog[1]],
    );

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({ q: "beta" }),
    });

    const explorerEl = getElementWithProp(result, "initialAllSkills");

    // The search itself is applied client-side; the island needs the full list
    // so the zero-results state can still offer a way back into it.
    expect(explorerEl.props.initialAllSkills).toHaveLength(3);
  });

  it("passes empty arrays when there are no skills (not undefined)", async () => {
    getSkillsMock.mockResolvedValue([]);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    const explorerEl = getElementWithProp(result, "initialAllSkills");

    expect(Array.isArray(explorerEl.props.initialAllSkills)).toBe(true);
    expect(explorerEl.props.initialAllSkills).toHaveLength(0);
    expect(Array.isArray(explorerEl.props.initialDanishSkills)).toBe(true);
    expect(Array.isArray(explorerEl.props.initialTrendingSkills)).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// SkillTopicIndex — the server-rendered crawl path to the topic pages
// ---------------------------------------------------------------------------

/**
 * Regression guard for the two crawl holes found in the 2026-08-13 audit:
 * the hub linked to none of the eight /skills/topic/* URLs (Google had never
 * crawled one), and the explorer's 12-card cap left 86 of 98 skill detail
 * pages reachable only via the sitemap. The topic index is the one hop that
 * closes both, so it has to stay in the *server* tree — mocking it away or
 * moving it inside the client island would silently reopen both holes.
 */
describe("SkillsPageContent — topic index", () => {
  it("renders the topic index in the server tree, not the client island", async () => {
    getSkillsMock.mockResolvedValue([makeSkill("s1", "Alpha", "desc")]);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    // `counts` is SkillTopicIndex's identifying prop; the explorer has none.
    expect(() => getElementWithProp(result, "counts")).not.toThrow();
  });

  it("counts every topic, including ones with no skills", async () => {
    getSkillsMock.mockResolvedValue([
      makeSkill("s1", "Alpha", "desc"),
      makeSkill("s2", "Beta", "desc"),
    ]);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });
    const { counts } = getElementWithProp(result, "counts").props;

    // makeSkill hardcodes category "frontend".
    expect(counts.frontend).toBe(2);
    // Every slug present at 0 rather than absent, so the link still renders.
    expect(Object.keys(counts).sort()).toEqual([...SKILL_CATEGORY_SLUGS].sort());
    expect(counts["backend-data"]).toBe(0);
  });

  it("counts the whole library, not the ?q= result, when a search is active", async () => {
    const wholeLibrary = [
      makeSkill("s1", "Alpha", "desc"),
      makeSkill("s2", "Beta", "desc"),
      makeSkill("s3", "Gamma", "desc"),
    ];
    const searchHit = [makeSkill("s2", "Beta", "desc")];

    // Filtered read (search passed) vs unfiltered read (search undefined).
    getSkillsMock.mockImplementation(async (search?: string) =>
      search === undefined ? wholeLibrary : searchHit,
    );

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({ q: "beta" }),
    });

    const { counts } = getElementWithProp(result, "counts").props;

    expect(counts.frontend).toBe(3);
  });
});
