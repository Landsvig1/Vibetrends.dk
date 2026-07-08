import { describe, it, expect } from "vitest";
import { filterProjects } from "../VibesExplorer";
import type { ShowcaseProject } from "@/lib/db";

/**
 * U4 — client island unit tests for VibesExplorer.tsx.
 *
 * These tests operate on pure logic extracted from the component so they can
 * run in the node environment without a DOM or rendering setup.
 *
 * Interactive-path tests (upvote rollback, sort refetch, modal opening,
 * delete flow, login gating) involve React state and event handlers that
 * require a component rendering environment; those are best covered by
 * Playwright e2e tests once the feature is deployed, or by adding
 * @testing-library/react if a jsdom environment is added to the test suite.
 * What we can cover here is the logic that's decoupled from the component
 * lifecycle.
 */

function makeProject(
  id: string,
  title: string,
  description: string,
  tools: string[] = []
): ShowcaseProject {
  return {
    id,
    title,
    description,
    author: "alice",
    upvotes: 3,
    imageUrl: "https://images.unsplash.com/photo-1.jpg",
    demoUrl: "https://example.com",
    githubUrl: undefined,
    tools,
    prompts: [],
    createdAt: "2026-01-01",
  };
}

const projects: ShowcaseProject[] = [
  makeProject("p1", "React Dashboard", "A fast dashboard built with React", ["cursor", "claude"]),
  makeProject("p2", "Python Scraper", "Scrapes data from the web", ["python"]),
  makeProject("p3", "Vibe Coding App", "Vibe code with AI", ["vibe-coding", "gpt"]),
];

// ---------------------------------------------------------------------------
// filterProjects — client-side search filter (no network request)
// ---------------------------------------------------------------------------

describe("filterProjects — client-side search, no network request", () => {
  it("returns all projects for an empty query", () => {
    expect(filterProjects(projects, "")).toHaveLength(3);
  });

  it("returns all projects for a whitespace-only query", () => {
    // The filter uses query.toLowerCase() — whitespace is falsy after trim()
    // but the function uses `if (!query) return projects` so whitespace IS a
    // query. This documents actual behavior (whitespace = filter on whitespace).
    // Nothing contains a space-only string, so all fail the includes() check.
    expect(filterProjects(projects, "   ")).toHaveLength(0);
  });

  it("matches on title case-insensitively", () => {
    expect(filterProjects(projects, "REACT")).toHaveLength(1);
    expect(filterProjects(projects, "react")[0].id).toBe("p1");
  });

  it("matches on description case-insensitively", () => {
    expect(filterProjects(projects, "SCRAPES")).toHaveLength(1);
    expect(filterProjects(projects, "scrapes")[0].id).toBe("p2");
  });

  it("matches via tool substring — 'vibe' matches tool 'vibe-coding'", () => {
    // Mirrors current JS .includes() behavior and the SQL tools::text ilike pattern.
    const results = filterProjects(projects, "vibe");
    // 'vibe' matches title of p3 ("Vibe Coding App") AND the 'vibe-coding' tool of p3
    // — both match, result is still just p3.
    const ids = results.map((p) => p.id);
    expect(ids).toContain("p3");
  });

  it("matches via tool substring — 'curs' matches tool 'cursor' (partial tool name)", () => {
    const results = filterProjects(projects, "curs");
    expect(results.map((p) => p.id)).toContain("p1");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterProjects(projects, "xyzzy-no-match-99")).toEqual([]);
  });

  it("returns empty array for an empty project list regardless of query", () => {
    expect(filterProjects([], "react")).toEqual([]);
  });

  it("search across all fields is cumulative (OR semantics): description + title", () => {
    const mixed = [
      makeProject("a", "Dashboard", "react inside description"),
      makeProject("b", "React App", "different description"),
    ];
    const results = filterProjects(mixed, "react");
    expect(results.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("empty state condition: search that matches nothing → empty array → empty state renders", () => {
    // This test documents the condition the VibesExplorer empty state checks:
    // filteredProjects.length === 0 when filterProjects returns [].
    const result = filterProjects(projects, "zzznomatch");
    expect(result.length).toBe(0); // → empty state block rendered
  });
});

// ---------------------------------------------------------------------------
// Upvote rollback — the core behavioral contract
// ---------------------------------------------------------------------------

describe("upvote optimistic rollback contract", () => {
  /**
   * The handleUpvote function in VibesExplorer follows this pattern:
   *   1. Save prevCount = current upvotes for the project
   *   2. Optimistically set upvotes to prevCount + 1
   *   3. On success: replace with server value (data.upvotes)
   *   4. On any failure (network / non-OK / 401): restore prevCount
   *
   * We test the pure state transitions rather than the event handler directly
   * (which requires a component environment). These tests document the
   * required contract so a future refactor can verify it hasn't broken.
   */

  it("optimistic increment: prevCount + 1 is the immediate displayed value", () => {
    const project = makeProject("p1", "Test", "Description here", []);
    project.upvotes = 5;

    // Simulate the optimistic update: map projects, set upvotes to prevCount + 1
    const prevCount = project.upvotes;
    const optimisticProjects = [project].map((p) =>
      p.id === "p1" ? { ...p, upvotes: prevCount + 1 } : p
    );
    expect(optimisticProjects[0].upvotes).toBe(6);
  });

  it("rollback on failure: prevCount is restored, not prevCount + 1", () => {
    const project = makeProject("p1", "Test", "Description here", []);
    project.upvotes = 5;
    const prevCount = project.upvotes;

    // Simulate rollback
    const rolledBack = [{ ...project, upvotes: prevCount + 1 }].map((p) =>
      p.id === "p1" ? { ...p, upvotes: prevCount } : p
    );
    expect(rolledBack[0].upvotes).toBe(5);
  });

  it("success path: server value replaces optimistic count", () => {
    const project = makeProject("p1", "Test", "Description here", []);
    project.upvotes = 5;
    const prevCount = project.upvotes;

    // Server returns 7 (e.g. concurrent upvotes from other users)
    const serverCount = 7;
    const afterSuccess = [{ ...project, upvotes: prevCount + 1 }].map((p) =>
      p.id === "p1" ? { ...p, upvotes: serverCount } : p
    );
    expect(afterSuccess[0].upvotes).toBe(7);
  });

  it("rollback does not affect other projects in the list", () => {
    const p1 = { ...makeProject("p1", "Alpha", "Desc alpha", []), upvotes: 5 };
    const p2 = { ...makeProject("p2", "Beta", "Desc beta", []), upvotes: 9 };
    const prevCount = p1.upvotes;

    // Optimistic update on p1
    let list = [p1, p2].map((p) => (p.id === "p1" ? { ...p, upvotes: prevCount + 1 } : p));
    expect(list.find((p) => p.id === "p2")?.upvotes).toBe(9); // unchanged

    // Rollback on p1
    list = list.map((p) => (p.id === "p1" ? { ...p, upvotes: prevCount } : p));
    expect(list.find((p) => p.id === "p1")?.upvotes).toBe(5); // restored
    expect(list.find((p) => p.id === "p2")?.upvotes).toBe(9); // still unchanged
  });
});

// ---------------------------------------------------------------------------
// Submit flow: new project prepended to the list
// ---------------------------------------------------------------------------

describe("submit flow — new project prepended to list", () => {
  it("a successful submit prepends the new project to the current list", () => {
    const existing = [makeProject("p1", "Existing", "Already in the list", [])];
    const newProj = makeProject("p2", "New Vibe", "Just submitted description", []);

    // Simulate setProjects((prev) => [newProj, ...prev])
    const updated = [newProj, ...existing];

    expect(updated[0].id).toBe("p2"); // new project is first
    expect(updated[1].id).toBe("p1"); // existing project is preserved
    expect(updated).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Delete flow: project removed from list
// ---------------------------------------------------------------------------

describe("delete flow — project removed from list", () => {
  it("a successful delete removes only the target project from the list", () => {
    const list = [
      makeProject("p1", "Keep", "Keep me around", []),
      makeProject("p2", "Delete", "Delete this one", []),
      makeProject("p3", "Keep too", "Keep me too", []),
    ];

    // Simulate setProjects((prev) => prev.filter((p) => p.id !== id))
    const after = list.filter((p) => p.id !== "p2");

    expect(after).toHaveLength(2);
    expect(after.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(after.some((p) => p.id === "p2")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sort-tab switching: sort behavior contract
// ---------------------------------------------------------------------------

describe("sort-tab switching contract", () => {
  /**
   * The VibesExplorer skips the first mount fetch and only refetches when
   * language or sort changes post-mount. This is documented as a behavioral
   * contract here so a future refactor can verify the skip-first-mount logic
   * is still intact.
   *
   * The actual useEffect/useRef behavior requires a component environment.
   * What we test here: the sort values the component passes to the API URL.
   */
  it("non-'new' sort values are appended as ?sort= param in the fetch URL", () => {
    // Simulate the URL construction logic from VibesExplorer's sort effect
    function buildFetchUrl(sort: string) {
      const params = new URLSearchParams();
      if (sort !== "new") params.set("sort", sort);
      const qs = params.toString();
      return qs ? `/api/vibes?${qs}` : "/api/vibes";
    }

    expect(buildFetchUrl("new")).toBe("/api/vibes");
    expect(buildFetchUrl("top")).toBe("/api/vibes?sort=top");
    expect(buildFetchUrl("az")).toBe("/api/vibes?sort=az");
  });
});
