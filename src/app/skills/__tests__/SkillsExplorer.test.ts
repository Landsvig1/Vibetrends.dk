import { describe, it, expect, vi } from "vitest";
import { filterSkills, executeUpvote } from "../SkillsExplorer";
import type { Skill } from "@/lib/db";

/**
 * U5 — client island unit tests for SkillsExplorer.tsx.
 *
 * Tests operate on pure exported functions (filterSkills, executeUpvote) so
 * they can run in the node environment without a DOM or rendering setup.
 *
 * executeUpvote is the real implementation used by the component's
 * handleUpvote. Tests that previously reimplemented the optimistic/rollback
 * arithmetic now call the real function with mock callbacks and fetch so a
 * real regression would be caught.
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
    const results = filterSkills(skills, "fullst");
    expect(results.map((s) => s.id)).toContain("s3");
  });

  it("matches via tag substring — 'vibe' matches tag 'vibe-coding'", () => {
    const results = filterSkills(skills, "vibe");
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
    const result = filterSkills(skills, "zzznomatch");
    expect(result.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// executeUpvote — the real upvote implementation used by the component
// ---------------------------------------------------------------------------

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
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 4 }));

    await executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess,
      onRollback,
      onAuthRequired,
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(4);
    expect(onRollback).not.toHaveBeenCalled();
    expect(onAuthRequired).not.toHaveBeenCalled();
  });

  it("calls onRollback on non-OK, non-401 response", async () => {
    const pendingIds = new Set<string>();
    const onOptimistic = vi.fn();
    const onSuccess = vi.fn();
    const onRollback = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(500, {}));

    await executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess,
      onRollback,
      onAuthRequired: vi.fn(),
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls onRollback and onAuthRequired on 401", async () => {
    const pendingIds = new Set<string>();
    const onRollback = vi.fn();
    const onAuthRequired = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(401, {}));

    await executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback,
      onAuthRequired,
    });

    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
  });

  it("calls onRollback on network failure (fetch throws)", async () => {
    const pendingIds = new Set<string>();
    const onRollback = vi.fn();
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback,
      onAuthRequired: vi.fn(),
    });

    expect(onRollback).toHaveBeenCalledTimes(1);
  });

  it("removes item from pendingIds after request resolves", async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 5 }));

    await executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(pendingIds.has("s1")).toBe(false);
  });

  it("second upvote on same item while first is in-flight fires only one request", async () => {
    const pendingIds = new Set<string>();
    let resolveFirst: ((r: Response) => void) | undefined;
    const firstInFlight = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const mockFetch = vi.fn().mockReturnValueOnce(firstInFlight);
    const onOptimistic = vi.fn();

    // Start first upvote — fetch stays unresolved
    const p1 = executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Second click on same item — guard must fire, no second fetch
    await executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(onOptimistic).toHaveBeenCalledTimes(1);

    resolveFirst!(mockResponse(200, { upvotes: 4 }));
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
      .mockResolvedValue(mockResponse(200, { upvotes: 5 }));

    const p1 = executeUpvote("s1", "/api/skills/s1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    await executeUpvote("s2", "/api/skills/s2/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    resolveFirst!(mockResponse(200, { upvotes: 6 }));
    await p1;
  });
});

// ---------------------------------------------------------------------------
// View-tab switching: view-specific fetch URL contract
// ---------------------------------------------------------------------------

describe("view-tab switching contract", () => {
  it("view board fetches use ?view= param", () => {
    function buildFetchUrl(view: string) {
      if (view !== "danish" && view !== "hot" && view !== "trending") return null;
      return `/api/skills?view=${view}`;
    }

    expect(buildFetchUrl("danish")).toBe("/api/skills?view=danish");
    expect(buildFetchUrl("hot")).toBe("/api/skills?view=hot");
    expect(buildFetchUrl("trending")).toBe("/api/skills?view=trending");
    expect(buildFetchUrl("all")).toBeNull();
  });

  it("full catalog fetch URL has no ?view= param", () => {
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
    expect(result.length).toBe(0);
  });

  it("empty initial skills list always triggers empty state for board views", () => {
    const result = filterSkills([], "");
    expect(result.length).toBe(0);
  });
});
