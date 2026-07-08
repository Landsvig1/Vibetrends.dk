import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * U7 — server component tests for /agents page.tsx.
 *
 * These tests verify:
 *  1. The server component passes real agent data (not an empty list) to the
 *     client island — this is the core crawlability/SSR assertion.
 *  2. getAgents() is called with no category arg so it returns the default
 *     catalog (excludes MCP Server + Host per db.ts query logic).
 *  3. AgentsExplorer receives initialItems from the server, not an empty list.
 *  4. The view tabs (danish/all/hot) within /agents are client-side only —
 *     the server fetches the full catalog; the client filters/sorts in-memory.
 *
 * We test AgentsPageContent (the inner async component) directly rather than
 * through the outer Suspense shell, because the shell just wraps a Suspense
 * boundary — it adds no data logic of its own.
 *
 * AgentsExplorer and loading.tsx are mocked to keep tests hermetic.
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

vi.mock("../loading", () => ({
  default: () => null,
}));

import { cookies } from "next/headers";
import { getAgents } from "@/lib/db";
import { AgentsPageContent } from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cookiesMock = vi.mocked(cookies);
const getAgentsMock = vi.mocked(getAgents);

/** Minimal Agent fixture for the default catalog. */
function makeAgent(id: string, name: string, description: string, isDanish = false) {
  return {
    id,
    name,
    developer: "alice",
    category: "CLI" as const,
    description,
    installCommand: `npx ${name}`,
    systemPrompt: "",
    upvotes: 0,
    tags: [],
    isDanish,
    denmarkSpecific: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: Danish cookie
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === "vibe_lang" ? { name: "vibe_lang", value: "da" } : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  getAgentsMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// AgentsPageContent — prop-passing / data contract
// ---------------------------------------------------------------------------

describe("AgentsPageContent — passes real agent data to client island", () => {
  it("calls getAgents with no category (default catalog) and the lang from the vibe_lang cookie", async () => {
    const items = [makeAgent("a1", "my-agent", "An AI agent tool")];
    getAgentsMock.mockResolvedValue(items);

    await AgentsPageContent({ searchParams: Promise.resolve({}) });

    expect(getAgentsMock).toHaveBeenCalledWith(
      undefined, // no search term from server component
      undefined, // no category — default catalog (excludes MCP Server + Host)
      "da"       // lang from mocked cookie
    );
  });

  it("defaults lang to 'da' when the cookie is absent", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    getAgentsMock.mockResolvedValue([]);

    await AgentsPageContent({ searchParams: Promise.resolve({}) });

    expect(getAgentsMock).toHaveBeenCalledWith(undefined, undefined, "da");
  });

  it("passes lang='en' when the vibe_lang cookie is 'en'", async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "vibe_lang" ? { name: "vibe_lang", value: "en" } : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    getAgentsMock.mockResolvedValue([]);

    await AgentsPageContent({ searchParams: Promise.resolve({}) });

    expect(getAgentsMock).toHaveBeenCalledWith(undefined, undefined, "en");
  });

  it("passes ?q= as search to getAgents when present", async () => {
    const items = [makeAgent("a1", "claude-tool", "An AI tool for Claude")];
    getAgentsMock.mockResolvedValue(items);

    await AgentsPageContent({ searchParams: Promise.resolve({ q: "claude" }) });

    expect(getAgentsMock).toHaveBeenCalledWith(
      "claude", // search term from ?q= param
      undefined,
      "da"
    );
  });

  it("passes undefined search when q is empty string", async () => {
    getAgentsMock.mockResolvedValue([]);

    await AgentsPageContent({ searchParams: Promise.resolve({ q: "" }) });

    expect(getAgentsMock).toHaveBeenCalledWith(undefined, undefined, "da");
  });
});

// ---------------------------------------------------------------------------
// AgentsPageContent — AgentsExplorer receives initialItems (SSR content)
// ---------------------------------------------------------------------------

describe("AgentsPageContent — AgentsExplorer receives the fetched agent list", () => {
  it("passes initialItems to AgentsExplorer so SSR output contains real content", async () => {
    const items = [
      makeAgent("a1", "alpha-agent", "Alpha agent description", true),
      makeAgent("a2", "beta-agent", "Beta agent description", false),
    ];
    getAgentsMock.mockResolvedValue(items);

    const result = await AgentsPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = result as any;
    expect(el.props.scope).toBe("agents");
    expect(el.props.initialItems).toHaveLength(2);
    expect(el.props.initialItems[0].name).toBe("alpha-agent");
    expect(el.props.initialItems[1].name).toBe("beta-agent");
  });

  it("passes an empty array when there are no agents (not undefined)", async () => {
    getAgentsMock.mockResolvedValue([]);

    const result = await AgentsPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = result as any;
    expect(Array.isArray(el.props.initialItems)).toBe(true);
    expect(el.props.initialItems).toHaveLength(0);
  });

  it("passes scope='agents' so AgentsExplorer uses the agents detail base and copy", async () => {
    getAgentsMock.mockResolvedValue([]);

    const result = await AgentsPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).props.scope).toBe("agents");
  });

  it("isDanish flag is preserved in the passed initialItems (client view tabs use it)", async () => {
    // The danish/all/hot view tabs in AgentsExplorer are client-side only:
    // they filter/sort the server-fetched initialItems in-memory. isDanish must
    // be present in the passed items so the Dansk tab works without a re-fetch.
    const items = [
      makeAgent("a1", "danish-agent", "A Danish agent", true),
      makeAgent("a2", "global-agent", "A global agent", false),
    ];
    getAgentsMock.mockResolvedValue(items);

    const result = await AgentsPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passed = (result as any).props.initialItems;
    expect(passed.find((a: { id: string }) => a.id === "a1")?.isDanish).toBe(true);
    expect(passed.find((a: { id: string }) => a.id === "a2")?.isDanish).toBe(false);
  });
});
