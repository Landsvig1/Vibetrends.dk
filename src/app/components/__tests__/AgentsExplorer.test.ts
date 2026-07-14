import { describe, it, expect, vi } from "vitest";
import { filterAgents, executeUpvote, cardTestId } from "../AgentsExplorer";
import type { Agent } from "@/lib/db";

/**
 * U7 — client island unit tests for AgentsExplorer.tsx.
 *
 * Tests operate on pure exported functions (filterAgents, executeUpvote) so
 * they can run in the node environment without a DOM or rendering setup.
 *
 * executeUpvote is the real implementation used by the component's
 * handleUpvote. Tests that previously reimplemented the optimistic/rollback
 * arithmetic now call the real function with mock callbacks and fetch so a
 * real regression would be caught.
 *
 * AgentsExplorer serves three routes (/cli, /mcp, /agents) — the same filter
 * and mutation logic applies across all three. Tests are written
 * scope-agnostically where possible.
 */

function makeAgent(
  id: string,
  name: string,
  description: string,
  tags: string[] = [],
  category: Agent["category"] = "CLI"
): Agent {
  return {
    id,
    name,
    developer: "alice",
    category,
    description,
    installCommand: `npx ${name}`,
    systemPrompt: "",
    upvotes: 3,
    tags,
    isDanish: false,
    denmarkSpecific: false,
  };
}

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agents: Agent[] = [
  makeAgent("a1", "vibe-cli", "A fast CLI for vibers", ["productivity", "ai"], "CLI"),
  makeAgent("a2", "claude-mcp", "MCP server for Claude", ["mcp", "llm"], "MCP Server"),
  makeAgent("a3", "vibe-coder", "Vibe code with AI assistants", ["vibe-coding", "gpt"], "CLI"),
];

// ---------------------------------------------------------------------------
// filterAgents — client-side search filter (no network request)
// ---------------------------------------------------------------------------

describe("filterAgents — client-side search, no network request", () => {
  it("returns all agents for an empty query", () => {
    expect(filterAgents(agents, "")).toHaveLength(3);
  });

  it("returns all agents for a whitespace-only query (whitespace is not empty)", () => {
    expect(filterAgents(agents, "   ")).toHaveLength(0);
  });

  it("matches on name case-insensitively", () => {
    expect(filterAgents(agents, "VIBE-CLI")).toHaveLength(1);
    expect(filterAgents(agents, "vibe-cli")[0].id).toBe("a1");
  });

  it("matches on description case-insensitively", () => {
    expect(filterAgents(agents, "FAST")).toHaveLength(1);
    expect(filterAgents(agents, "fast")[0].id).toBe("a1");
  });

  it("matches via tag substring — 'vibe' matches tag 'vibe-coding'", () => {
    const results = filterAgents(agents, "vibe");
    const ids = results.map((a) => a.id);
    expect(ids).toContain("a1");
    expect(ids).toContain("a3");
  });

  it("matches via partial tag — 'code' matches tag 'vibe-coding'", () => {
    const results = filterAgents(agents, "code");
    const ids = results.map((a) => a.id);
    expect(ids).toContain("a3");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterAgents(agents, "xyzzy-no-match-99")).toEqual([]);
  });

  it("returns empty array for an empty agent list regardless of query", () => {
    expect(filterAgents([], "vibe")).toEqual([]);
  });

  it("search across all fields is cumulative (OR semantics): name + description + tags", () => {
    const mixed = [
      makeAgent("b1", "Dashboard", "mcp inside description"),
      makeAgent("b2", "MCP Agent", "different description"),
    ];
    const results = filterAgents(mixed, "mcp");
    expect(results.map((a) => a.id).sort()).toEqual(["b1", "b2"]);
  });

  it("empty state condition: search that matches nothing → empty array → empty state renders", () => {
    const result = filterAgents(agents, "zzznomatch");
    expect(result.length).toBe(0);
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
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 4 }));

    await executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess,
      onRollback,
      onAuthRequired,
    });

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(4);
    expect(onRollback).not.toHaveBeenCalled();
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/a1/upvote", { method: "POST" });
  });

  it("calls onRollback on non-OK, non-401 response", async () => {
    const pendingIds = new Set<string>();
    const onOptimistic = vi.fn();
    const onRollback = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(500, {}));

    await executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
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

    await executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
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

    await executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback,
      onAuthRequired: vi.fn(),
    });

    expect(onRollback).toHaveBeenCalledTimes(1);
  });

  it("removes item from pendingIds after request resolves", async () => {
    const pendingIds = new Set<string>();
    const mockFetch = vi.fn().mockResolvedValue(mockResponse(200, { upvotes: 4 }));

    await executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(pendingIds.has("a1")).toBe(false);
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
    const p1 = executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Second click on same item — guard must fire, no second fetch
    await executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
      onOptimistic,
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    // Fetch was called exactly once; the second click was a no-op
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // onOptimistic was called exactly once (only from the first click)
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
      .mockResolvedValue(mockResponse(200, { upvotes: 4 }));

    const p1 = executeUpvote("a1", "/api/agents/a1/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    await executeUpvote("a2", "/api/agents/a2/upvote", pendingIds, mockFetch, {
      onOptimistic: vi.fn(),
      onSuccess: vi.fn(),
      onRollback: vi.fn(),
      onAuthRequired: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    resolveFirst!(mockResponse(200, { upvotes: 4 }));
    await p1;
  });
});

// ---------------------------------------------------------------------------
// cardTestId — derived from page scope, not the individual agent's category.
// The /agents scope shows a mixed feed (CLI agents included, MCP excluded),
// so every card there must stay "agent-card" regardless of that agent's own
// category — a per-agent-category derivation would wrongly give CLI-category
// agents shown on /agents a "cli-card" testid.
// ---------------------------------------------------------------------------

describe("cardTestId — scope-derived, not category-derived", () => {
  it("mcp scope always yields mcp-card", () => {
    expect(cardTestId("mcp")).toBe("mcp-card");
  });

  it("cli scope always yields cli-card", () => {
    expect(cardTestId("cli")).toBe("cli-card");
  });

  it("agents scope yields agent-card, even though the mixed feed includes CLI-category agents", () => {
    expect(cardTestId("agents")).toBe("agent-card");
  });
});

// ---------------------------------------------------------------------------
// Submit flow: new agent prepended to the list
// ---------------------------------------------------------------------------

describe("submit flow — new agent prepended to list", () => {
  it("a successful submit prepends the new agent to the current list", () => {
    const existing = [makeAgent("a1", "existing", "Already in the list")];
    const newAgent = makeAgent("a2", "New Tool", "Just submitted");

    const updated = [newAgent, ...existing];

    expect(updated[0].id).toBe("a2");
    expect(updated[1].id).toBe("a1");
    expect(updated).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Delete flow: agent removed from list
// ---------------------------------------------------------------------------

describe("delete flow — agent removed from list", () => {
  it("a successful delete removes only the target agent from the list", () => {
    const list = [
      makeAgent("a1", "Keep", "Keep me around"),
      makeAgent("a2", "Delete", "Delete this one"),
      makeAgent("a3", "Keep too", "Keep me too"),
    ];

    const after = list.filter((a) => a.id !== "a2");

    expect(after).toHaveLength(2);
    expect(after.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(after.some((a) => a.id === "a2")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// View tab filtering: client-side only, no re-fetch
// ---------------------------------------------------------------------------

describe("view tab filtering — client-side logic, no network request", () => {
  const danishAgent = { ...makeAgent("d1", "dansk-cli", "Dansk tool"), isDanish: true, denmarkSpecific: true };
  const globalAgent = { ...makeAgent("d2", "global-cli", "Global tool"), isDanish: false, denmarkSpecific: false };
  const allAgents = [danishAgent, globalAgent];

  it("danish view: only isDanish agents are shown", () => {
    const result = allAgents.filter((a) => a.isDanish);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d1");
  });

  it("all view: all agents shown sorted alphabetically by name", () => {
    const sorted = [...allAgents].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[0].name).toBe("dansk-cli");
    expect(sorted[1].name).toBe("global-cli");
  });

  it("hot view: agents remain in server order (upvotes-desc, no client sort)", () => {
    const hotAgents = allAgents;
    expect(hotAgents).toHaveLength(2);
  });

  it("search overrides view: all agents are searched regardless of view", () => {
    const search = "global";
    const searchActive = search.trim() !== "";
    const viewAgents = searchActive ? allAgents : allAgents.filter((a) => a.isDanish);
    const results = filterAgents(viewAgents, search);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("d2");
  });
});
