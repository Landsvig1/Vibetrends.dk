import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * U7 — server component tests for /mcp page.tsx.
 *
 * These tests verify:
 *  1. The server component passes real MCP server data (not an empty list) to
 *     the client island — this is the core crawlability/SSR assertion.
 *  2. getAgents() is called with category='MCP Server' and the lang from the
 *     vibe_lang cookie — confirming the correct category scope for /mcp.
 *  3. AgentsExplorer receives initialItems from the server, not an empty list.
 *
 * We test McpPageContent (the inner async component) directly rather than
 * through the outer Suspense shell, because the shell just wraps a Suspense
 * boundary — it adds no data logic of its own.
 *
 * AgentsExplorer is mocked to keep tests hermetic.
 */

// -- mocks must be declared before any import that triggers the mocked module --

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getAgents: vi.fn(),
}));

// Stub the client island — it receives initialItems but we don't render it.
vi.mock("../../components/AgentsExplorer", () => ({
  default: () => null,
}));

import { cookies } from "next/headers";
import { getAgents } from "@/lib/db";
import { McpPageContent } from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cookiesMock = vi.mocked(cookies);
const getAgentsMock = vi.mocked(getAgents);

/** Minimal Agent fixture for MCP servers. */
function makeMcpAgent(id: string, name: string, description: string) {
  return {
    id,
    name,
    developer: "alice",
    category: "MCP Server" as const,
    description,
    installCommand: `npx ${name}`,
    systemPrompt: "",
    upvotes: 0,
    tags: [],
    isDanish: false,
    denmarkSpecific: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: English cookie
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === "vibe_lang" ? { name: "vibe_lang", value: "en" } : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  getAgentsMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// McpPageContent — prop-passing / data contract
// ---------------------------------------------------------------------------

describe("McpPageContent — passes real MCP server data to client island", () => {
  it("calls getAgents with category='MCP Server' and the lang from the vibe_lang cookie", async () => {
    const items = [makeMcpAgent("m1", "claude-mcp", "MCP server for Claude")];
    getAgentsMock.mockResolvedValue(items);

    await McpPageContent();

    expect(getAgentsMock).toHaveBeenCalledWith(
      undefined,    // no search term from server component
      "MCP Server", // category scoped to MCP
      "en"          // lang from mocked cookie
    );
  });

  it("defaults lang to 'da' when the cookie is absent", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    getAgentsMock.mockResolvedValue([]);

    await McpPageContent();

    expect(getAgentsMock).toHaveBeenCalledWith(undefined, "MCP Server", "da");
  });
});

// ---------------------------------------------------------------------------
// McpPageContent — AgentsExplorer receives initialItems (SSR content)
// ---------------------------------------------------------------------------

describe("McpPageContent — AgentsExplorer receives the fetched MCP server list", () => {
  it("passes initialItems to AgentsExplorer so SSR output contains real content", async () => {
    const items = [
      makeMcpAgent("m1", "claude-mcp", "MCP server for Claude"),
      makeMcpAgent("m2", "cursor-mcp", "MCP server for Cursor"),
    ];
    getAgentsMock.mockResolvedValue(items);

    const result = await McpPageContent();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = result as any;
    expect(el.props.scope).toBe("mcp");
    expect(el.props.initialItems).toHaveLength(2);
    expect(el.props.initialItems[0].name).toBe("claude-mcp");
    expect(el.props.initialItems[1].name).toBe("cursor-mcp");
  });

  it("passes an empty array when there are no MCP servers (not undefined)", async () => {
    getAgentsMock.mockResolvedValue([]);

    const result = await McpPageContent();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = result as any;
    expect(el.props.scope).toBe("mcp");
    expect(Array.isArray(el.props.initialItems)).toBe(true);
    expect(el.props.initialItems).toHaveLength(0);
  });

  it("passes scope='mcp' so AgentsExplorer uses the MCP detail base and copy", async () => {
    getAgentsMock.mockResolvedValue([]);

    const result = await McpPageContent();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).props.scope).toBe("mcp");
  });
});
