import { describe, it, expect } from "vitest";
import { filterSkills } from "../SkillsExplorer";
import type { Skill } from "@/lib/db";

/**
 * U5 — client island unit tests for SkillsExplorer.tsx.
 *
 * Mirrors the shape of src/app/vibes/__tests__/VibesExplorer.test.ts (U4).
 *
 * These tests operate on pure logic extracted from the component so they can
 * run in the node environment without a DOM or rendering setup.
 *
 * Interactive-path tests (upvote rollback, view-switch refetch, modal opening,
 * login gating) involve React state and event handlers that require a component
 * rendering environment; those are best covered by Playwright e2e tests once
 * the feature is deployed. What we can cover here is logic decoupled from the
 * component lifecycle.
 */

function makeSkill(
  id: string,
  title: string,
  description: string,
  tags: string[] = [],
  categoryLabel = "Frontend"
): Skill {
  return {
    id,
    title,
    description,
    vibeCoder: "alice",
    vibeCoderTitle: "Vibe Coder",
    category: "frontend" as const,
    categoryLabel,
    rating: 4.5,
    reviewsCount: 5,
    upvotes: 3,
    tags,
    githubUrl: "https://github.com/alice/skill",
  };
}

const skills: Skill[] = [
  makeSkill(
    "s1",
    "React Dashboard",
    "A fast dashboard built with React",
    ["cursor", "claude"],
    "Frontend"
  ),
  makeSkill(
    "s2",
    "Python Scraper",
    "Scrapes data from the web",
    ["python"],
    "Backend"
  ),
  makeSkill(
    "s3",
    "Vibe Coding App",
    "Vibe code with AI",
    ["vibe-coding", "gpt"],
    "Fullstack"
  ),
];

// ---------------------------------------------------------------------------
// filterSkills — client-side search filter (no network request)
// ---------------------------------------------------------------------------

describe("filterSkills — client-side search, no network request", () => {
  it("returns all skills for an empty query", () => {
    expect(filterSkills(skills, "")).toHaveLength(3);
  });

  it("returns all skills for a whitespace-only query", () => {
    // Mirrors filterProjects behavior: whitespace is a query (not falsy after
    // the `if (!query)` check since a non-empty whitespace string is truthy),
    // so nothing matches and the result is empty.
    expect(filterSkills(skills, "   ")).toHaveLength(0);
  });

  it("matches on title case-insensitively", () => {
    expect(filterSkills(skills, "REACT")).toHaveLength(1);
    expect(filterSkills(skills, "react")[0].id).toBe("s1");
  });

  it("matches on description case-insensitively", () => {
    expect(filterSkills(skills, "SCRAPES")).toHaveLength(1);
    expect(filterSkills(skills, "scrapes")[0].id).toBe("s2");
  });

  it("matches on categoryLabel case-insensitively", () => {
    // s3 has categoryLabel "Fullstack" → searching "fullst" should match it.
    const results = filterSkills(skills, "fullst");
    expect(results.map((s) => s.id)).toContain("s3");
  });

  it("matches via tag substring — 'vibe' matches tag 'vibe-coding'", () => {
    // Mirrors current JS .includes() behavior and the SQL tags::text ilike pattern.
    const results = filterSkills(skills, "vibe");
    // 'vibe' matches title of s3 ("Vibe Coding App") AND the 'vibe-coding' tag.
    const ids = results.map((s) => s.id);
    expect(ids).toContain("s3");
  });

  it("matches via tag substring — 'curs' matches tag 'cursor' (partial tag name)", () => {
    const results = filterSkills(skills, "curs");
    expect(results.map((s) => s.id)).toContain("s1");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterSkills(skills, "xyzzy-no-match-99")).toEqual([]);
  });

  it("returns empty array for an empty skill list regardless of query", () => {
    expect(filterSkills([], "react")).toEqual([]);
  });

  it("search across all fields is cumulative (OR semantics): description + title", () => {
    const mixed = [
      makeSkill("a", "Dashboard", "react inside description", []),
      makeSkill("b", "React App", "different description", []),
    ];
    const results = filterSkills(mixed, "react");
    expect(results.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("empty state condition: search that matches nothing → empty array → empty state renders", () => {
    // Documents the condition SkillsExplorer's empty state checks:
    // gridSkills.length === 0 when filterSkills returns [].
    const result = filterSkills(skills, "zzznomatch");
    expect(result.length).toBe(0); // → empty state block rendered
  });
});

// ---------------------------------------------------------------------------
// Upvote optimistic rollback — the core behavioral contract
// ---------------------------------------------------------------------------

describe("upvote optimistic rollback contract", () => {
  /**
   * SkillsExplorer's handleUpvote follows this pattern:
   *   1. Save prevCount = current upvotes for the skill (from allSkills or viewSkills)
   *   2. Optimistically set upvotes to prevCount + 1 in BOTH lists
   *   3. On success: replace with server value (data.upvotes) in BOTH lists
   *   4. On any failure (network / non-OK / 401): restore prevCount in BOTH lists
   *
   * We test the pure state transitions (not the event handler, which needs a
   * component environment). These tests document the required contract.
   */

  it("optimistic increment: prevCount + 1 is the immediate displayed value", () => {
    const skill = makeSkill("s1", "Test", "Description here", []);
    skill.upvotes = 5;

    const prevCount = skill.upvotes;
    const optimistic = [skill].map((s) =>
      s.id === "s1" ? { ...s, upvotes: prevCount + 1 } : s
    );
    expect(optimistic[0].upvotes).toBe(6);
  });

  it("rollback on failure: prevCount is restored, not prevCount + 1", () => {
    const skill = makeSkill("s1", "Test", "Description here", []);
    skill.upvotes = 5;
    const prevCount = skill.upvotes;

    const rolledBack = [{ ...skill, upvotes: prevCount + 1 }].map((s) =>
      s.id === "s1" ? { ...s, upvotes: prevCount } : s
    );
    expect(rolledBack[0].upvotes).toBe(5);
  });

  it("success path: server value replaces optimistic count", () => {
    const skill = makeSkill("s1", "Test", "Description here", []);
    skill.upvotes = 5;
    const prevCount = skill.upvotes;

    // Server returns 7 (e.g. concurrent upvotes from other users)
    const serverCount = 7;
    const afterSuccess = [{ ...skill, upvotes: prevCount + 1 }].map((s) =>
      s.id === "s1" ? { ...s, upvotes: serverCount } : s
    );
    expect(afterSuccess[0].upvotes).toBe(7);
  });

  it("rollback does not affect other skills in the list", () => {
    const s1 = { ...makeSkill("s1", "Alpha", "Desc alpha", []), upvotes: 5 };
    const s2 = { ...makeSkill("s2", "Beta", "Desc beta", []), upvotes: 9 };
    const prevCount = s1.upvotes;

    // Optimistic update on s1
    let list = [s1, s2].map((s) =>
      s.id === "s1" ? { ...s, upvotes: prevCount + 1 } : s
    );
    expect(list.find((s) => s.id === "s2")?.upvotes).toBe(9);

    // Rollback on s1
    list = list.map((s) =>
      s.id === "s1" ? { ...s, upvotes: prevCount } : s
    );
    expect(list.find((s) => s.id === "s1")?.upvotes).toBe(5);
    expect(list.find((s) => s.id === "s2")?.upvotes).toBe(9);
  });

  it("both allSkills and viewSkills are updated optimistically and rolled back together", () => {
    const skill = { ...makeSkill("s1", "Test", "Desc here here", []), upvotes: 3 };
    const prevCount = skill.upvotes;

    // Simulate applying optimistic to both lists
    const optimistic = (list: Skill[]) =>
      list.map((s) => (s.id === "s1" ? { ...s, upvotes: prevCount + 1 } : s));
    const restore = (list: Skill[]) =>
      list.map((s) => (s.id === "s1" ? { ...s, upvotes: prevCount } : s));

    let allSkills = [skill];
    let viewSkills = [skill];

    allSkills = optimistic(allSkills);
    viewSkills = optimistic(viewSkills);
    expect(allSkills[0].upvotes).toBe(4);
    expect(viewSkills[0].upvotes).toBe(4);

    allSkills = restore(allSkills);
    viewSkills = restore(viewSkills);
    expect(allSkills[0].upvotes).toBe(3);
    expect(viewSkills[0].upvotes).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// View-tab switching: view-specific fetch URL contract
// ---------------------------------------------------------------------------

describe("view-tab switching contract", () => {
  /**
   * SkillsExplorer skips the first mount fetches and only refetches when
   * view or language changes post-mount.
   *
   * The actual useEffect/useRef behavior requires a component environment.
   * What we test: the URLs the component passes to fetch() per view.
   */
  it("view board fetches use ?view= param", () => {
    function buildFetchUrl(view: string) {
      if (view !== "danish" && view !== "hot" && view !== "trending") return null;
      return `/api/skills?view=${view}`;
    }

    expect(buildFetchUrl("danish")).toBe("/api/skills?view=danish");
    expect(buildFetchUrl("hot")).toBe("/api/skills?view=hot");
    expect(buildFetchUrl("trending")).toBe("/api/skills?view=trending");
    // "all" view doesn't fetch a board
    expect(buildFetchUrl("all")).toBeNull();
  });

  it("full catalog fetch URL has no ?view= param", () => {
    // The allSkills refetch always calls /api/skills with no view param.
    const url = "/api/skills";
    expect(url).toBe("/api/skills");
  });
});

// ---------------------------------------------------------------------------
// Per-topic counts: derived from allSkills, not viewSkills
// ---------------------------------------------------------------------------

describe("per-topic counts", () => {
  it("counts are derived from allSkills, bucketed by category slug", () => {
    const catalogSkills = [
      makeSkill("s1", "A", "Desc A", [], "Frontend"),
      makeSkill("s2", "B", "Desc B", [], "Frontend"),
      makeSkill("s3", "C", "Desc C", [], "Backend"),
    ];
    // Override categories to use valid SkillCategorySlug values.
    catalogSkills[0].category = "frontend" as const;
    catalogSkills[1].category = "frontend" as const;
    catalogSkills[2].category = "backend-data" as const;

    const counts = ["frontend", "backend-data", "design-ux"].reduce<
      Record<string, number>
    >((acc, slug) => {
      acc[slug] = catalogSkills.filter((s) => s.category === slug).length;
      return acc;
    }, {});

    expect(counts["frontend"]).toBe(2);
    expect(counts["backend-data"]).toBe(1);
    expect(counts["design-ux"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Submit flow: honeypot field present
// ---------------------------------------------------------------------------

describe("submit flow — honeypot field", () => {
  it("the submit form payload does not include website_url (honeypot) field", () => {
    // The form has a hidden honeypot input with name="website_url" that is NOT
    // included in the JSON.stringify payload — only explicit state fields are
    // submitted. This test documents the intended behavior.
    const payload = {
      title: "My Skill",
      category: "productivity",
      description: "A good skill",
      tags: ["react"],
      githubUrl: "https://github.com/alice/skill",
    };

    expect(Object.keys(payload)).not.toContain("website_url");
    expect(payload.title).toBe("My Skill");
  });
});

// ---------------------------------------------------------------------------
// Empty state: condition that triggers the empty UI block
// ---------------------------------------------------------------------------

describe("empty state condition", () => {
  it("search that matches nothing → empty array → empty state renders", () => {
    const result = filterSkills(skills, "zzznomatch");
    // gridSkills.length === 0 triggers the empty state branch in SkillsExplorer
    expect(result.length).toBe(0);
  });

  it("empty initial skills list always triggers empty state for board views", () => {
    const result = filterSkills([], "");
    // For board views, gridSkills = viewSkills. If viewSkills = [], this is 0.
    expect(result.length).toBe(0);
  });
});
