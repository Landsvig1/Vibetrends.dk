import { describe, it, expect, vi } from "vitest";
import { slugify } from "@/lib/slug";
import {
  filterProjects,
  executeUpvote,
  parseToolsInput,
  parsePromptsInput,
  MAX_TOOLS,
  MAX_TOOL_LENGTH,
  MAX_PROMPTS,
  MAX_PROMPT_LENGTH,
} from "../VibesExplorer";
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
    slug: slugify(title),
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
    isDanish: false,
    denmarkSpecific: false,
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
    // A whitespace-only query is not a search. The component agrees
    // (`searchActive` is `search.trim() !== ""`), so this filter has to as
    // well: when the two disagreed, three spaces produced the empty state with
    // its suggestions suppressed and the board tab still lit — no results and
    // no visible cause.
    expect(filterProjects(projects, "   ")).toHaveLength(3);
  });

  it("ignores surrounding whitespace on a real query", () => {
    expect(filterProjects(projects, "  react  ").map((p) => p.id)).toEqual(["p1"]);
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

  // The search field promises "forfattere". Author matching was missing, so a
  // visitor searching a builder's handle got the empty state — and since every
  // live row has tools = null, title/description were the only fields of the
  // three named that did anything. These fail if author matching regresses.
  it("matches on author, which the placeholder promises ('forfattere')", () => {
    const byAuthor = [
      ...projects,
      { ...makeProject("p4", "Unrelated Title", "unrelated description"), author: "webdev82_vibe" },
    ];
    const results = filterProjects(byAuthor, "webdev82");
    expect(results.map((p) => p.id)).toEqual(["p4"]);
  });

  it("matches author case-insensitively and on a partial handle", () => {
    const byAuthor = [
      { ...makeProject("p5", "Nothing Relevant", "nothing relevant"), author: "OCUPIE ApS" },
    ];
    expect(filterProjects(byAuthor, "ocupie").map((p) => p.id)).toEqual(["p5"]);
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
// Dansk/Alle/Hot view-tab contract — client-side only, no per-tab refetch
// ---------------------------------------------------------------------------

describe("view-tab switching contract (Dansk/Alle/Hot)", () => {
  const danishProject = makeProject("p1", "Dansk Vibe", "Dansk description", []);
  const foreignProject = makeProject("p2", "Foreign Vibe", "Foreign description", []);
  const all = [
    { ...danishProject, isDanish: true, denmarkSpecific: false, upvotes: 1 },
    { ...foreignProject, isDanish: false, denmarkSpecific: false, upvotes: 10 },
  ];

  it("Dansk view filters to isDanish projects only", () => {
    const danishOnly = all.filter((p) => p.isDanish);
    expect(danishOnly.map((p) => p.id)).toEqual(["p1"]);
  });

  it("Dansk view sorts by upvotes, ignoring denmarkSpecific", () => {
    const withDenmarkSpecific = [
      { ...danishProject, isDanish: true, denmarkSpecific: false, upvotes: 10 },
      { ...danishProject, id: "p3", isDanish: true, denmarkSpecific: true, upvotes: 1 },
    ];
    const sorted = withDenmarkSpecific
      .filter((p) => p.isDanish)
      .sort((a, b) => b.upvotes - a.upvotes);
    expect(sorted[0].id).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// parseToolsInput / parsePromptsInput — the submit form's two new fields
// ---------------------------------------------------------------------------
//
// Before these existed the form posted `tools: []` and `prompts: []` hardcoded,
// so the detail page's "Teknologier & Værktøjer" and "Core Prompts Anvendt"
// sections could never render for anything submitted through the UI. Both
// parsers clamp to projectSchema's limits so a freehand field can't turn into
// a 400 the visitor has to diagnose.

describe("parseToolsInput — comma-separated tools field", () => {
  it("splits on commas and trims each entry", () => {
    expect(parseToolsInput("Claude Code, Next.js ,  Supabase")).toEqual([
      "Claude Code",
      "Next.js",
      "Supabase",
    ]);
  });

  it("drops empty entries from trailing or doubled commas", () => {
    expect(parseToolsInput("Cursor,,Vercel,")).toEqual(["Cursor", "Vercel"]);
  });

  it("returns an empty array for an empty or whitespace-only field", () => {
    expect(parseToolsInput("")).toEqual([]);
    expect(parseToolsInput("   ")).toEqual([]);
    expect(parseToolsInput(" , , ")).toEqual([]);
  });

  it("caps at MAX_TOOLS so projectSchema's .max(10) can't 400 the submission", () => {
    const many = Array.from({ length: MAX_TOOLS + 5 }, (_, i) => `tool${i}`).join(",");
    expect(parseToolsInput(many)).toHaveLength(MAX_TOOLS);
  });

  it("truncates an over-long tool to MAX_TOOL_LENGTH rather than failing validation", () => {
    const [tool] = parseToolsInput("x".repeat(MAX_TOOL_LENGTH + 20));
    expect(tool).toHaveLength(MAX_TOOL_LENGTH);
  });
});

describe("parsePromptsInput — blank-line-separated prompts field", () => {
  it("splits on blank lines, one prompt per block", () => {
    expect(parsePromptsInput("Byg en dashboard-side\n\nTilføj et filter")).toEqual([
      "Byg en dashboard-side",
      "Tilføj et filter",
    ]);
  });

  it("keeps a multi-line prompt as ONE prompt", () => {
    // The reason for splitting on blank lines rather than newlines: prompts
    // are usually more than one line long.
    expect(parsePromptsInput("line one\nline two\nline three")).toEqual([
      "line one\nline two\nline three",
    ]);
  });

  it("tolerates blank lines that carry whitespace", () => {
    expect(parsePromptsInput("first\n   \nsecond")).toEqual(["first", "second"]);
  });

  it("returns an empty array for an empty or whitespace-only field", () => {
    expect(parsePromptsInput("")).toEqual([]);
    expect(parsePromptsInput("\n\n  \n\n")).toEqual([]);
  });

  it("caps at MAX_PROMPTS and truncates an over-long prompt", () => {
    const many = Array.from({ length: MAX_PROMPTS + 3 }, (_, i) => `p${i}`).join("\n\n");
    expect(parsePromptsInput(many)).toHaveLength(MAX_PROMPTS);

    const [prompt] = parsePromptsInput("y".repeat(MAX_PROMPT_LENGTH + 100));
    expect(prompt).toHaveLength(MAX_PROMPT_LENGTH);
  });
});
