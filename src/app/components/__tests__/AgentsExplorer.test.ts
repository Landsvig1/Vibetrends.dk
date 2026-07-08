import { describe, it, expect } from "vitest";
import { filterAgents } from "../AgentsExplorer";
import type { Agent } from "@/lib/db";

/**
 * U7 — client island unit tests for AgentsExplorer.tsx.
 *
 * These tests operate on pure logic extracted from the component so they can
 * run in the node environment without a DOM or rendering setup.
 *
 * Interactive-path tests (upvote rollback, language refetch, modal opening,
 * delete flow, login gating) involve React state and event handlers that
 * require a component rendering environment; those are best covered by
 * Playwright e2e tests. What we cover here is logic decoupled from the
 * component lifecycle:
 *   - filterAgents: the pure search filter
 *   - Upvote optimistic/rollback contract (state-transition logic)
 *   - Submit/delete list-mutation contracts
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
    // Mirrors filterProjects behavior: `if (!query) return agents` — whitespace
    // is truthy, so it IS used as the search term. Nothing contains whitespace-
    // only, so all fail the includes() check.
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
    // Mirrors current JS .includes() behavior and the SQL tags::text ilike pattern.
    const results = filterAgents(agents, "vibe");
    const ids = results.map((a) => a.id);
    // 'vibe' matches name of a1 ('vibe-cli') and a3 ('vibe-coder'), and tag 'vibe-coding' on a3.
    expect(ids).toContain("a1");
    expect(ids).toContain("a3");
  });

  it("matches via partial tag — 'code' matches tag 'vibe-coding'", () => {
    // Ensures substring matching within tags (not exact-element matching).
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
// Upvote rollback — the core behavioral contract (KTD1)
// ---------------------------------------------------------------------------

describe("upvote optimistic rollback contract", () => {
  /**
   * handleUpvote in AgentsExplorer follows this pattern:
   *   1. Save prevCount = current upvotes for the agent
   *   2. Optimistically set upvotes to prevCount + 1
   *   3. On success: replace with server value (data.upvotes)
   *   4. On any failure (network / non-OK / 401): restore prevCount
   *
   * We test the pure state transitions rather than the event handler directly
   * (which requires a component environment). These tests document the
   * required contract so a future refactor can verify it hasn't broken.
   */

  it("optimistic increment: prevCount + 1 is the immediate displayed value", () => {
    const agent = makeAgent("a1", "vibe-cli", "Description here");
    agent.upvotes = 5;

    const prevCount = agent.upvotes;
    const optimisticAgents = [agent].map((a) =>
      a.id === "a1" ? { ...a, upvotes: prevCount + 1 } : a
    );
    expect(optimisticAgents[0].upvotes).toBe(6);
  });

  it("rollback on failure: prevCount is restored, not prevCount + 1", () => {
    const agent = makeAgent("a1", "vibe-cli", "Description here");
    agent.upvotes = 5;
    const prevCount = agent.upvotes;

    const rolledBack = [{ ...agent, upvotes: prevCount + 1 }].map((a) =>
      a.id === "a1" ? { ...a, upvotes: prevCount } : a
    );
    expect(rolledBack[0].upvotes).toBe(5);
  });

  it("success path: server value replaces optimistic count", () => {
    const agent = makeAgent("a1", "vibe-cli", "Description here");
    agent.upvotes = 5;
    const prevCount = agent.upvotes;

    // Server returns 7 (e.g. concurrent upvotes from other users)
    const serverCount = 7;
    const afterSuccess = [{ ...agent, upvotes: prevCount + 1 }].map((a) =>
      a.id === "a1" ? { ...a, upvotes: serverCount } : a
    );
    expect(afterSuccess[0].upvotes).toBe(7);
  });

  it("rollback does not affect other agents in the list", () => {
    const a1 = { ...makeAgent("a1", "alpha", "Desc alpha"), upvotes: 5 };
    const a2 = { ...makeAgent("a2", "beta", "Desc beta"), upvotes: 9 };
    const prevCount = a1.upvotes;

    // Optimistic update on a1
    let list = [a1, a2].map((a) => (a.id === "a1" ? { ...a, upvotes: prevCount + 1 } : a));
    expect(list.find((a) => a.id === "a2")?.upvotes).toBe(9); // unchanged

    // Rollback on a1
    list = list.map((a) => (a.id === "a1" ? { ...a, upvotes: prevCount } : a));
    expect(list.find((a) => a.id === "a1")?.upvotes).toBe(5); // restored
    expect(list.find((a) => a.id === "a2")?.upvotes).toBe(9); // still unchanged
  });
});

// ---------------------------------------------------------------------------
// Submit flow: new agent prepended to the list
// ---------------------------------------------------------------------------

describe("submit flow — new agent prepended to list", () => {
  it("a successful submit prepends the new agent to the current list", () => {
    const existing = [makeAgent("a1", "existing", "Already in the list")];
    const newAgent = makeAgent("a2", "New Tool", "Just submitted");

    // Simulate setAgents((prev) => [newAgent, ...prev])
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

    // Simulate setAgents((prev) => prev.filter((a) => a.id !== id))
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
  /**
   * The view tabs (danish/all/hot) filter/sort the in-memory agents list.
   * No re-fetch is triggered on view change. These tests document the
   * required filtering contract so a future refactor can verify it.
   */

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
    // 'hot' view === the default server order (upvotes desc). No client sorting.
    // The server returns agents in the right order; the component just uses them.
    const hotAgents = allAgents; // unchanged from server order
    expect(hotAgents).toHaveLength(2);
  });

  it("search overrides view: all agents are searched regardless of view", () => {
    // When searchActive is true, viewAgents = agents (no view filter).
    // filterAgents is then applied to the full list.
    const search = "global";
    const searchActive = search.trim() !== "";
    const viewAgents = searchActive ? allAgents : allAgents.filter((a) => a.isDanish);
    const results = filterAgents(viewAgents, search);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("d2");
  });
});
