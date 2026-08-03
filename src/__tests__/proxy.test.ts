import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Tests for src/proxy.ts — the Next.js middleware rewrite/redirect layer.
 *
 * Covers three concerns:
 *  1. ?format=json content-negotiation rewrites pathname correctly.
 *  2. q→search alias: when ?q= is present in a ?format=json request, proxy
 *     renames it to ?search= before forwarding to the API route handler, so
 *     agent/crawler callers following ai.txt's documented path get correctly
 *     filtered results (API routes read "search", client nuqs binds to "q").
 *  3. The alias does NOT affect requests that are not ?format=json rewrites
 *     (i.e. human-facing routes and direct API calls are unaffected).
 *
 * We drive `proxy()` directly (it's a pure function of NextRequest → response)
 * without spinning up a Next.js server. The test constructs minimal NextRequest
 * objects matching the proxy's matching criteria.
 */

import { proxy } from "../proxy";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a NextRequest from an absolute URL string. */
function req(url: string): NextRequest {
  return new NextRequest(url);
}

/**
 * Stub the PostgREST call legacyAgentTarget() makes. Returns the rows the
 * lookup should see; pass `null` to simulate an unreachable/erroring Supabase.
 */
function stubAgentLookup(rows: { category: string }[] | null) {
  stubSupabaseEnv();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      rows === null
        ? new Response("boom", { status: 500 })
        : new Response(JSON.stringify(rows), { status: 200 })
    )
  );
}

/** legacyAgentTarget() no-ops without these, so the lookup tests must set them. */
function stubSupabaseEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// format=json rewrite — pathname
// ---------------------------------------------------------------------------

describe("proxy — ?format=json rewrites to the correct API path", () => {
  const cases: [string, string][] = [
    ["https://vibetrends.dk/vibes?format=json", "/api/vibes"],
    ["https://vibetrends.dk/skills?format=json", "/api/skills"],
    ["https://vibetrends.dk/mcp?format=json", "/api/mcp-servers"],
    ["https://vibetrends.dk/cli?format=json", "/api/cli"],
    ["https://vibetrends.dk/forum?format=json", "/api/forum"],
  ];

  for (const [inputUrl, expectedPath] of cases) {
    it(`rewrites ${new URL(inputUrl).pathname}?format=json → ${expectedPath}`, async () => {
      const response = await proxy(req(inputUrl));
      // NextResponse.rewrite sets the x-middleware-rewrite header
      const rewriteHeader = response.headers.get("x-middleware-rewrite");
      expect(rewriteHeader).not.toBeNull();
      expect(new URL(rewriteHeader!).pathname).toBe(expectedPath);
    });
  }
});

// ---------------------------------------------------------------------------
// q→search alias — the core fix for agent/crawler callers
// ---------------------------------------------------------------------------

describe("proxy — aliases ?q= to ?search= in format=json rewrites", () => {
  it("converts q=react to search=react for /vibes?format=json&q=react", async () => {
    const response = await proxy(req("https://vibetrends.dk/vibes?format=json&q=react"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    expect(rewriteHeader).not.toBeNull();
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("react");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("converts q=typescript to search=typescript for /skills?format=json&q=typescript", async () => {
    const response = await proxy(req("https://vibetrends.dk/skills?format=json&q=typescript"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("typescript");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("converts q=cursor to search=cursor for /mcp?format=json&q=cursor", async () => {
    const response = await proxy(req("https://vibetrends.dk/mcp?format=json&q=cursor"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("cursor");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("converts q=npm to search=npm for /cli?format=json&q=npm", async () => {
    const response = await proxy(req("https://vibetrends.dk/cli?format=json&q=npm"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("npm");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("preserves other params alongside the alias (e.g. sort=top)", async () => {
    const response = await proxy(req("https://vibetrends.dk/vibes?format=json&q=react&sort=top"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("react");
    expect(rewriteUrl.searchParams.get("sort")).toBe("top");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
    expect(rewriteUrl.searchParams.has("format")).toBe(false);
  });

  it("does not set search when q is absent — unfiltered catalog result", async () => {
    const response = await proxy(req("https://vibetrends.dk/vibes?format=json"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.has("search")).toBe(false);
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-format=json requests — alias must NOT apply
// ---------------------------------------------------------------------------

describe("proxy — q→search alias does NOT affect non-format=json requests", () => {
  it("does not rewrite /vibes?q=react (human-facing route, no format=json)", async () => {
    const response = await proxy(req("https://vibetrends.dk/vibes?q=react"));
    // Should be NextResponse.next() — no rewrite header
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    expect(rewriteHeader).toBeNull();
  });

  it("does not add search to direct /api/vibes?q=react calls", async () => {
    // Direct API calls are not caught by the format=json branch.
    const response = await proxy(req("https://vibetrends.dk/api/vibes?q=react"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    expect(rewriteHeader).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Redirect rules — unchanged by this feature
// ---------------------------------------------------------------------------

describe("proxy — redirect rules are unaffected", () => {
  it("redirects /agents?category=MCP+Server to /mcp (308)", async () => {
    const response = await proxy(
      req("https://vibetrends.dk/agents?category=MCP+Server")
    );
    expect(response.status).toBe(308);
    const location = response.headers.get("location");
    expect(location).toContain("/mcp");
  });

  it("redirects /tool-clis to /cli (308)", async () => {
    const response = await proxy(req("https://vibetrends.dk/tool-clis"));
    expect(response.status).toBe(308);
    const location = response.headers.get("location");
    expect(location).toContain("/cli");
  });

  // /agents was retired — it listed exactly the /cli rows under a second
  // canonical. The category form above must keep winning, so this rule has to
  // stay ordered after it.
  it("redirects the retired /agents hub to /cli (308)", async () => {
    const response = await proxy(req("https://vibetrends.dk/agents"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cli");
  });

  it("still sends /agents?category=MCP+Server to /mcp, not /cli", async () => {
    const response = await proxy(req("https://vibetrends.dk/agents?category=MCP+Server"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/mcp");
  });

  it("redirects /agents?format=json to /cli rather than rewriting to an API route", async () => {
    const response = await proxy(req("https://vibetrends.dk/agents?format=json"));
    expect(response.status).toBe(308);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cli");
  });
});

// ---------------------------------------------------------------------------
// /agents/:id — per-row legacy redirect.
//
// This lives in proxy, not in the app route, because with cacheComponents the
// root layout's Suspense shell is prerendered and flushed before any page code
// runs: a permanentRedirect() thrown from a server component gets streamed into
// an already-sent 200, which Google reads as a soft redirect and never
// consolidates. Verified against a production build — an app-route version of
// this returned 200. Only proxy runs early enough to set a real 308, and with
// no /agents/[id] route behind it a miss gets a real 404 too.
// ---------------------------------------------------------------------------

describe("proxy — /agents/:id maps to the row's surviving canonical", () => {
  it("sends a CLI row to /cli/:id with a real 308", async () => {
    stubAgentLookup([{ category: "CLI" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_123"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cli/a_123");
  });

  it("sends an MCP Server row to /mcp/:id", async () => {
    stubAgentLookup([{ category: "MCP Server" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_456"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/mcp/a_456");
  });

  // No /agents/[id] route exists behind these, so falling through means Next's
  // own router answers with a real 404 rather than a soft one.
  it("falls through for a row that no longer exists", async () => {
    stubAgentLookup([]);
    const response = await proxy(req("https://vibetrends.dk/agents/gone"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("falls through for a Host row — hosts have no detail page to land on", async () => {
    stubAgentLookup([{ category: "Host" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_789"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("falls through rather than erroring when the lookup fails", async () => {
    stubAgentLookup(null);
    const response = await proxy(req("https://vibetrends.dk/agents/a_123"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("falls through without calling out when Supabase env vars are unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(req("https://vibetrends.dk/agents/a_123"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("url-encodes the id into the lookup so a crafted id cannot inject filters", async () => {
    stubSupabaseEnv();
    const fetchMock = vi.fn<(url: string | URL) => Promise<Response>>(
      async () => new Response("[]", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await proxy(req("https://vibetrends.dk/agents/a_1%26select=*"));

    // The whole id stays inside the id=eq. filter — the crafted "&" is escaped
    // rather than starting a second PostgREST parameter, so the only query
    // params the server sees are the three we built.
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect([...requested.searchParams.keys()]).toEqual(["id", "select", "limit"]);
    expect(requested.searchParams.get("select")).toBe("category");
    expect(requested.searchParams.get("id")).toContain("select=*");
  });
});
