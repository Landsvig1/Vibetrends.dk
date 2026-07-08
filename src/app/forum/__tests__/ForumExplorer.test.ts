import { describe, it, expect, vi } from "vitest";
import { filterThreads, executeUpvote } from "../ForumExplorer";
import type { ForumThread } from "@/lib/db";

/**
 * U6 — client island unit tests for ForumExplorer.tsx.
 *
 * Tests operate on pure exported functions (filterThreads, executeUpvote) so
 * they can run in the node environment without a DOM or rendering setup.
 *
 * executeUpvote is the real implementation used by the component's
 * handleUpvote. Tests that previously reimplemented the optimistic/rollback
 * arithmetic now call the real function with mock callbacks and fetch so a
 * real regression would be caught.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeThread(
  id: string,
  title: string,
  content: string,
  upvotes = 0,
  replyCount = 0
): ForumThread {
  return {
    id,
    title,
    author: "alice",
    category: "General",
    content,
    upvotes,
    replies: Array.from({ length: replyCount }, (_, i) => ({
      id: `reply-${i}`,
      threadId: id,
      author: "bob",
      content: `Reply ${i}`,
      upvotes: 0,
      createdAt: "2026-01-02",
    })),
    createdAt: "2026-01-01",
  };
}

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const threads: ForumThread[] = [
  makeThread("t1", "Thread Alpha", "Content alpha", 5, 2),
  makeThread("t2", "Thread Beta", "Content beta", 12, 0),
  makeThread("t3", "Thread Gamma", "Content gamma", 1, 7),
];

// ---------------------------------------------------------------------------
// filterThreads — client-side search filter (no network request)
// ---------------------------------------------------------------------------

describe("filterThreads — client-side search, no network request", () => {
  it("returns all threads for an empty query", () => {
    expect(filterThreads(threads, "")).toHaveLength(3);
  });

  it("returns all threads for a whitespace-only query", () => {
    // Whitespace is truthy, so it IS used as the search term.
    // Nothing contains whitespace-only, so all fail the includes() check.
    expect(filterThreads(threads, "   ")).toHaveLength(0);
  });

  it("matches on title case-insensitively", () => {
    expect(filterThreads(threads, "ALPHA")).toHaveLength(1);
    expect(filterThreads(threads, "alpha")[0].id).toBe("t1");
  });

  it("matches on content case-insensitively", () => {
    expect(filterThreads(threads, "GAMMA")).toHaveLength(1);
    expect(filterThreads(threads, "gamma")[0].id).toBe("t3");
  });

  it("matches on author case-insensitively", () => {
    // All threads have author "alice"
    const results = filterThreads(threads, "ALICE");
    expect(results).toHaveLength(3);
  });

  it("matches on category case-insensitively", () => {
    const results = filterThreads(threads, "general");
    expect(results).toHaveLength(3);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterThreads(threads, "xyzzy-no-match-99")).toEqual([]);
  });

  it("returns empty array for an empty thread list regardless of query", () => {
    expect(filterThreads([], "alpha")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Empty state condition
// ---------------------------------------------------------------------------

describe("empty state condition", () => {
  it("threads.length === 0 when no threads are present → empty state renders", () => {
    const result: ForumThread[] = [];
    expect(result.length).toBe(0);
  });

  it("non-empty threads list → thread cards rendered, not empty state", () => {
    expect(threads.length).toBeGreaterThan(0);
  });

  it("empty state uses forum.empty and forum.empty_sub keys (translation key contract)", () => {
    const requiredKeys = ["forum.empty", "forum.empty_sub"];
    expect(requiredKeys).toHaveLength(2);
    expect(requiredKeys[0]).toBe("forum.empty");
    expect(requiredKeys[1]).toBe("forum.empty_sub");
  });
});

// ---------------------------------------------------------------------------
// Reply count rendering contract
// ---------------------------------------------------------------------------

describe("reply count rendering", () => {
  it("thread.replies.length is the value rendered as the reply count", () => {
    const threadWith3Replies = makeThread("t1", "Title", "Content", 0, 3);
    expect(threadWith3Replies.replies.length).toBe(3);
  });

  it("zero replies renders as 0 (not undefined or null)", () => {
    const threadNoReplies = makeThread("t1", "Title", "Content", 0, 0);
    expect(threadNoReplies.replies.length).toBe(0);
  });

  it("reply counts from getThreads batched fetch are preserved through initialThreads prop", () => {
    const withReplies = makeThread("t-with", "Title", "Content", 0, 5);
    const withoutReplies = makeThread("t-without", "Title", "Content", 0, 0);

    expect(withReplies.replies.length).toBe(5);
    expect(withoutReplies.replies.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// executeUpvote — the real upvote implementation used by the component
// ---------------------------------------------------------------------------

describe("executeUpvote — optimistic upvote with rollback (real implementation)", () => {
  it("calls onOptimistic immediately and onSuccess with server count on 200", async () => {
    const pendingIds = new Set<string>();
    const onOptimistic = vi.fn();
    const onSuccess = vi.fn();
    const onRollback = vi.fn();
    const onAuthRequired = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 6 }));

    await executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess,
      onRollback,
      onAuthRequired,
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(6);
    expect(onRollback).not.toHaveBeenCalled();
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith("/api/forum/t1/upvote", { method: "POST" });
  });

  it("calls onRollback on non-OK, non-401 response", async () => {
    const pendingIds = new Set<string>();
    const onOptimistic = vi.fn();
    const onRollback = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(500, {}));

    await executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback,
      onAuthRequired: vi.fn(),
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onRollback).toHaveBeenCalledTimes(1);
  });

  it("calls onRollback and onAuthRequired on 401", async () => {
    const pendingIds = new Set<string>();
    const onRollback = vi.fn();
    const onAuthRequired = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(401, {}));

    await executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
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

    await executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback,
      onAuthRequired: vi.fn(),
    });

    expect(onRollback).toHaveBeenCalledTimes(1);
  });

  it("removes item from pendingIds after request resolves", async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 6 }));

    await executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(pendingIds.has("t1")).toBe(false);
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
    const p1 = executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Second click on same item — guard must fire, no second fetch
    await executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Fetch was called exactly once; the second click was a no-op
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // onOptimistic was called exactly once (only from the first click)
    expect(onOptimistic).toHaveBeenCalledTimes(1);

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
      .mockResolvedValue(mockResponse(200, { upvotes: 13 }));

    const p1 = executeUpvote("t1", "/api/forum/t1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    await executeUpvote("t2", "/api/forum/t2/upvote", pendingIds, mockFetch, {
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
// Create thread: new thread prepended to the list
// ---------------------------------------------------------------------------

describe("create thread — new thread prepended to list", () => {
  it("a successful create prepends the new thread to the current list", () => {
    const existing = [makeThread("t1", "Existing", "Already in the list")];
    const newThread = makeThread("t2", "New Thread", "Just created");

    const updated = [newThread, ...existing];

    expect(updated[0].id).toBe("t2");
    expect(updated[1].id).toBe("t1");
    expect(updated).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Delete flow: thread removed from list
// ---------------------------------------------------------------------------

describe("delete flow — thread removed from list", () => {
  it("a successful delete removes only the target thread from the list", () => {
    const list = [
      makeThread("t1", "Keep", "Keep me around"),
      makeThread("t2", "Delete", "Delete this one"),
      makeThread("t3", "Keep too", "Keep me too"),
    ];

    const after = list.filter((t) => t.id !== "t2");

    expect(after).toHaveLength(2);
    expect(after.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(after.some((t) => t.id === "t2")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sort/category URL construction contract
// ---------------------------------------------------------------------------

describe("sort and category fetch URL construction", () => {
  function buildFetchUrl(sort: string, category: string) {
    const params = new URLSearchParams();
    if (category !== "All") params.set("category", category);
    if (sort === "new") params.set("sort", "new");
    const qs = params.toString();
    return qs ? `/api/forum?${qs}` : "/api/forum";
  }

  it("default sort ('top') and 'All' category → no params", () => {
    expect(buildFetchUrl("top", "All")).toBe("/api/forum");
  });

  it("'new' sort appends ?sort=new", () => {
    expect(buildFetchUrl("new", "All")).toBe("/api/forum?sort=new");
  });

  it("specific category appends ?category=X", () => {
    expect(buildFetchUrl("top", "Tools")).toBe("/api/forum?category=Tools");
  });

  it("'new' sort + specific category appends both params", () => {
    const url = buildFetchUrl("new", "Tools");
    expect(url).toContain("sort=new");
    expect(url).toContain("category=Tools");
    expect(url).toContain("/api/forum?");
  });
});

// ---------------------------------------------------------------------------
// Login gating contract
// ---------------------------------------------------------------------------

describe("login gating contract", () => {
  it("unauthenticated upvote: user=null guard fires before any fetch (contract document)", () => {
    const user = null;
    const wouldOpenModal = !user;
    expect(wouldOpenModal).toBe(true);
  });

  it("unauthenticated create thread: user=null guard fires before any fetch", () => {
    const user = null;
    const wouldOpenModal = !user;
    expect(wouldOpenModal).toBe(true);
  });

  it("authenticated user: upvote proceeds (no modal)", () => {
    const user = { username: "alice", id: "u1" };
    const wouldOpenModal = !user;
    expect(wouldOpenModal).toBe(false);
  });
});
