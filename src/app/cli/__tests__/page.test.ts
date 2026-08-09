import { describe, it, expect, vi, beforeEach } from "vitest";
import { slugify } from "@/lib/slug";

/**
 * U7 — server component tests for /cli page.tsx.
 *
 * These tests verify:
 *  1. The server component passes real CLI item data (not an empty list) to the
 *     client island — this is the core crawlability/SSR assertion.
 *  2. getCli() is called with the lang from the vibe_lang cookie.
 *  3. AgentsExplorer receives initialItems from the server, not an empty list.
 *
 * We test CliPageContent (the inner async component) directly rather than
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
  getCli: vi.fn(),
}));

// Stub the client island — it receives initialItems but we don't render it.
vi.mock("../../components/AgentsExplorer", () => ({
  default: () => null,
}));

vi.mock("../loading", () => ({
  default: () => null,
}));

import { cookies } from "next/headers";
import { getCli } from "@/lib/db";
import { CliPageContent } from "../page";
import { getElementWithProp } from "@/test-utils/reactTree";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cookiesMock = vi.mocked(cookies);
const getCliMock = vi.mocked(getCli);

/** Minimal Agent fixture. */
function makeAgent(id: string, name: string, description: string) {
  return {
    id,
    slug: slugify(name),
    name,
    developer: "alice",
    category: "CLI" as const,
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

  // Cookie mock retained for module isolation; page no longer reads it.
  cookiesMock.mockResolvedValue({
    get: () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  getCliMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// CliPageContent — prop-passing / data contract
// ---------------------------------------------------------------------------

describe("CliPageContent — passes real CLI data to client island", () => {
  it("calls getCli with hardcoded 'da' lang", async () => {
    const items = [makeAgent("a1", "vibe-cli", "A CLI tool for vibes")];
    getCliMock.mockResolvedValue(items);

    await CliPageContent({ searchParams: Promise.resolve({}) });

    expect(getCliMock).toHaveBeenCalledWith(
      undefined, // no search term from server component
      "da"       // hardcoded Danish
    );
  });

  it("passes ?q= as search to getCli when present", async () => {
    const items = [makeAgent("a1", "vibe-cli", "A CLI tool for vibes")];
    getCliMock.mockResolvedValue(items);

    await CliPageContent({ searchParams: Promise.resolve({ q: "vibe" }) });

    expect(getCliMock).toHaveBeenCalledWith(
      "vibe", // search term from ?q= param
      "da"
    );
  });

  it("passes undefined search when q is empty string", async () => {
    getCliMock.mockResolvedValue([]);

    await CliPageContent({ searchParams: Promise.resolve({ q: "" }) });

    expect(getCliMock).toHaveBeenCalledWith(undefined, "da");
  });
});

// ---------------------------------------------------------------------------
// CliPageContent — AgentsExplorer receives initialItems (SSR content)
// ---------------------------------------------------------------------------

describe("CliPageContent — AgentsExplorer receives the fetched CLI item list", () => {
  it("passes initialItems to AgentsExplorer so SSR output contains real content", async () => {
    const items = [
      makeAgent("a1", "vibe-cli", "A CLI tool for vibes"),
      makeAgent("a2", "agent-runner", "Runs AI agents from the terminal"),
    ];
    getCliMock.mockResolvedValue(items);

    const result = await CliPageContent({ searchParams: Promise.resolve({}) });

    const el = getElementWithProp(result, "initialItems");
    expect(el.props.scope).toBe("cli");
    expect(el.props.initialItems).toHaveLength(2);
    expect(el.props.initialItems[0].name).toBe("vibe-cli");
    expect(el.props.initialItems[1].name).toBe("agent-runner");
  });

  it("passes an empty array when there are no CLI items (not undefined)", async () => {
    getCliMock.mockResolvedValue([]);

    const result = await CliPageContent({ searchParams: Promise.resolve({}) });

    const el = getElementWithProp(result, "initialItems");
    expect(el.props.scope).toBe("cli");
    expect(Array.isArray(el.props.initialItems)).toBe(true);
    expect(el.props.initialItems).toHaveLength(0);
  });

  it("passes scope='cli' so AgentsExplorer uses the CLI detail base and copy", async () => {
    getCliMock.mockResolvedValue([]);

    const result = await CliPageContent({ searchParams: Promise.resolve({}) });

    expect(getElementWithProp(result, "initialItems").props.scope).toBe("cli");
  });
});
