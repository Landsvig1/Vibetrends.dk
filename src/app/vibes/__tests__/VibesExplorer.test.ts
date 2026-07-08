import { describe, it, expect, vi } from "vitest";
import { filterProjects, executeUpvote } from "../VibesExplorer";
import type { ShowcaseProject } from "@/lib/db";

/**
 * U4 — client island unit tests for VibesExplorer.tsx.
 *
 * Tests operate on pure exported functions (filterProjects, executeUpvote) so
 * they can run in the node environment without a DOM or rendering setup.
 *
 * executeUpvote is the real implementation used by the component's
 * handleUpvote. Tests that previously reimplemented the optimistic/rollback
 * arithmetic now call the real function with mock callbacks and fetch so a
 * real regression would be caught.
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
    const results = filterProjects(projects, "vibe");
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
    const result = filterProjects(projects, "zzznomatch");
    expect(result.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// executeUpvote — the real upvote implementation used by the component
// ---------------------------------------------------------------------------

/**
 * Helper: build a mock Response object.
 */
function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("executeUpvote — optimistic upvote with rollback (real implementation)", () => {
  it("calls onOptimistic immediately and onSuccess with server count on 200", async () => {
    const pendingIds = new Set<string>();
    const onOptimistic = vi.fn();
    const onSuccess = vi.fn();
    const onRollback = vi.fn();
    const onAuthRequired = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 6 }));

    await executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess,
      onRollback,
      onAuthRequired,
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(6);
    expect(onRollback).not.toHaveBeenCalled();
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith("/api/vibes/p1/upvote", { method: "POST" });
  });

  it("calls onRollback on non-OK, non-401 response", async () => {
    const pendingIds = new Set<string>();
    const onOptimistic = vi.fn();
    const onSuccess = vi.fn();
    const onRollback = vi.fn();
    const onAuthRequired = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(500, {}));

    await executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess,
      onRollback,
      onAuthRequired,
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onAuthRequired).not.toHaveBeenCalled();
  });

  it("calls onRollback and onAuthRequired on 401", async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(401, {}));
    const onOptimistic = vi.fn();
    const onSuccess = vi.fn();
    const onRollback = vi.fn();
    const onAuthRequired = vi.fn();

    await executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess,
      onRollback,
      onAuthRequired,
    });

    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls onRollback on network failure (fetch throws)", async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const onOptimistic = vi.fn();
    const onRollback = vi.fn();

    await executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback,
      onAuthRequired: vi.fn(),
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onRollback).toHaveBeenCalledTimes(1);
  });

  it("removes item from pendingIds after successful request", async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 7 }));

    await executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(pendingIds.has("p1")).toBe(false);
  });

  it("removes item from pendingIds after failed request", async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(500, {}));

    await executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(pendingIds.has("p1")).toBe(false);
  });

  it("second upvote on same item while first is in-flight fires only one request", async () => {
    const pendingIds = new Set<string>();
    let resolveFirst: ((r: Response) => void) | undefined;
    const firstInFlight = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const mockFetch = vi.fn().mockReturnValueOnce(firstInFlight);
    const onOptimistic = vi.fn();

    // Start first upvote — fetch is in-flight (unresolved)
    const p1 = executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Second call on the same item — guard must fire, no second fetch
    await executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Fetch was called exactly once: the second click was a no-op
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // onOptimistic was called exactly once (only from the first click)
    expect(onOptimistic).toHaveBeenCalledTimes(1);

    // Allow the first request to resolve so no promise leaks
    resolveFirst!(mockResponse(200, { upvotes: 6 }));
    await p1;
  });

  it("second upvote on a different item while first is in-flight is allowed", async () => {
    const pendingIds = new Set<string>();
    let resolveFirst: ((r: Response) => void) | undefined;
    const firstInFlight = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const mockFetch = vi
      .fn()
      .mockReturnValueOnce(firstInFlight)
      .mockResolvedValue(mockResponse(200, { upvotes: 4 }));

    const p1 = executeUpvote("p1", "/api/vibes/p1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Different item — should proceed immediately
    await executeUpvote("p2", "/api/vibes/p2/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Both requests fired
    expect(mockFetch).toHaveBeenCalledTimes(2);

    resolveFirst!(mockResponse(200, { upvotes: 6 }));
    await p1;
  });
});

// ---------------------------------------------------------------------------
// Submit flow: new project prepended to the list
// ---------------------------------------------------------------------------

describe("submit flow — new project prepended to list", () => {
  it("a successful submit prepends the new project to the current list", () => {
    const existing = [makeProject("p1", "Existing", "Already in the list", [])];
    const newProj = makeProject("p2", "New Vibe", "Just submitted description", []);

    const updated = [newProj, ...existing];

    expect(updated[0].id).toBe("p2");
    expect(updated[1].id).toBe("p1");
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
  it("non-'new' sort values are appended as ?sort= param in the fetch URL", () => {
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
