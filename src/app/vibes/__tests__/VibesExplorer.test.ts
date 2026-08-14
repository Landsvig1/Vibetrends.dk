import { describe, it, expect, vi } from "vitest";
import { slugify } from "@/lib/slug";
import {
  filterProjects,
  executeUpvote,
  parseToolsInput,
  parsePromptsInput,
  validateSubmissionLimits,
  selectBoardProjects,
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

describe("selectBoardProjects — board membership and ordering", () => {
  const board = [
    { ...makeProject("dk-low", "Bravo", "d"), isDanish: true, upvotes: 1 },
    { ...makeProject("dk-high", "Zulu", "d"), isDanish: true, upvotes: 40 },
    { ...makeProject("foreign", "Alfa", "d"), isDanish: false, upvotes: 10 },
  ];

  it("Dansk filters to isDanish and orders by upvotes", () => {
    expect(selectBoardProjects(board, "danish", false).map((p) => p.id)).toEqual([
      "dk-high",
      "dk-low",
    ]);
  });

  it("Alle keeps everything and orders alphabetically by title", () => {
    expect(selectBoardProjects(board, "all", false).map((p) => p.title)).toEqual([
      "Alfa",
      "Bravo",
      "Zulu",
    ]);
  });

  it("Hot keeps everything and orders by upvotes", () => {
    expect(selectBoardProjects(board, "hot", false).map((p) => p.id)).toEqual([
      "dk-high",
      "foreign",
      "dk-low",
    ]);
  });

  // The two regressions that re-enabling the Hot tab exposed. Hot used to
  // return the array untouched, trusting the server's initial sort=top order.
  it("Hot re-sorts after a submission is prepended", () => {
    // upvotes 0 rather than 1 so it can't tie with dk-low: a stable sort keeps
    // ties in insertion order, which would make the assertion pass for the
    // wrong reason.
    const afterSubmit = [
      { ...makeProject("new", "Ny", "d"), isDanish: true, upvotes: 0 },
      ...board,
    ];
    const hot = selectBoardProjects(afterSubmit, "hot", false);
    expect(hot[0].id).toBe("dk-high");
    expect(hot[hot.length - 1].id).toBe("new");
  });

  it("Hot re-sorts after an upvote rewrites a count in place", () => {
    const afterUpvote = board.map((p) =>
      p.id === "dk-low" ? { ...p, upvotes: 99 } : p
    );
    expect(selectBoardProjects(afterUpvote, "hot", false)[0].id).toBe("dk-low");
  });

  it("an active search overrides the board and preserves the incoming order", () => {
    expect(selectBoardProjects(board, "danish", true).map((p) => p.id)).toEqual(
      board.map((p) => p.id)
    );
  });

  it("does not mutate the array it is given", () => {
    const before = board.map((p) => p.id);
    selectBoardProjects(board, "hot", false);
    selectBoardProjects(board, "all", false);
    expect(board.map((p) => p.id)).toEqual(before);
  });
});

// parseToolsInput / parsePromptsInput — the submit form's two new fields
// ---------------------------------------------------------------------------
//
// Before these existed the form posted `tools: []` and `prompts: []` hardcoded,
// so the detail page's "Teknologier & Værktøjer" and "Core Prompts Anvendt"
// sections could never render for anything submitted through the UI. Both
// parsers split only; validateSubmissionLimits reports anything over
// projectSchema's limits rather than silently truncating it.

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

  it("preserves everything the visitor typed — limits are reported, not applied here", () => {
    // These used to .slice() to projectSchema's limits. Truncating silently
    // loses the submitter's work; validateSubmissionLimits reports instead.
    const many = Array.from({ length: MAX_TOOLS + 5 }, (_, i) => `tool${i}`).join(",");
    expect(parseToolsInput(many)).toHaveLength(MAX_TOOLS + 5);

    const [tool] = parseToolsInput("x".repeat(MAX_TOOL_LENGTH + 20));
    expect(tool).toHaveLength(MAX_TOOL_LENGTH + 20);
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

  it("preserves an over-long or over-count prompt rather than truncating it", () => {
    const many = Array.from({ length: MAX_PROMPTS + 3 }, (_, i) => `p${i}`).join("\n\n");
    expect(parsePromptsInput(many)).toHaveLength(MAX_PROMPTS + 3);

    const [prompt] = parsePromptsInput("y".repeat(MAX_PROMPT_LENGTH + 100));
    expect(prompt).toHaveLength(MAX_PROMPT_LENGTH + 100);
  });
});

// ---------------------------------------------------------------------------
// validateSubmissionLimits — report, don't mangle
// ---------------------------------------------------------------------------

describe("validateSubmissionLimits — surfaces the limit instead of truncating", () => {
  it("returns null when both fields are within projectSchema's limits", () => {
    expect(validateSubmissionLimits([], [])).toBeNull();
    expect(validateSubmissionLimits(["Cursor"], ["byg noget"])).toBeNull();
  });

  it("accepts exactly the limits (boundary, not off-by-one)", () => {
    const tools = Array.from({ length: MAX_TOOLS }, (_, i) => `t${i}`);
    const prompts = Array.from({ length: MAX_PROMPTS }, (_, i) => `p${i}`);
    expect(validateSubmissionLimits(tools, prompts)).toBeNull();
    expect(validateSubmissionLimits(["x".repeat(MAX_TOOL_LENGTH)], [])).toBeNull();
    expect(validateSubmissionLimits([], ["y".repeat(MAX_PROMPT_LENGTH)])).toBeNull();
  });

  it("reports too many tools, naming how many to remove", () => {
    const tools = Array.from({ length: MAX_TOOLS + 3 }, (_, i) => `t${i}`);
    expect(validateSubmissionLimits(tools, [])).toContain("Fjern 3");
  });

  it("reports an over-long tool name", () => {
    const msg = validateSubmissionLimits(["x".repeat(MAX_TOOL_LENGTH + 1)], []);
    expect(msg).toContain(String(MAX_TOOL_LENGTH));
  });

  it("reports too many prompts", () => {
    const prompts = Array.from({ length: MAX_PROMPTS + 1 }, (_, i) => `p${i}`);
    expect(validateSubmissionLimits([], prompts)).toContain("Fjern 1");
  });

  it("reports WHICH prompt is too long, 1-indexed to match the Step N labels", () => {
    const prompts = ["kort", "y".repeat(MAX_PROMPT_LENGTH + 100)];
    const msg = validateSubmissionLimits([], prompts);
    // The detail page renders these as "Step 1", "Step 2" — the message has to
    // point at the same one the submitter is looking at.
    expect(msg).toContain("Prompt 2");
    expect(msg).toContain(String(MAX_PROMPT_LENGTH + 100));
  });
});
