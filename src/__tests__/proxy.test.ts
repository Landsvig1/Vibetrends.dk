import { describe, it, expect } from "vitest";

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

// ---------------------------------------------------------------------------
// format=json rewrite — pathname
// ---------------------------------------------------------------------------

describe("proxy — ?format=json rewrites to the correct API path", () => {
  const cases: [string, string][] = [
    ["https://vibetrends.dk/vibes?format=json", "/api/vibes"],
    ["https://vibetrends.dk/skills?format=json", "/api/skills"],
    ["https://vibetrends.dk/agents?format=json", "/api/agents"],
    ["https://vibetrends.dk/mcp?format=json", "/api/mcp-servers"],
    ["https://vibetrends.dk/cli?format=json", "/api/cli"],
    ["https://vibetrends.dk/forum?format=json", "/api/forum"],
  ];

  for (const [inputUrl, expectedPath] of cases) {
    it(`rewrites ${new URL(inputUrl).pathname}?format=json → ${expectedPath}`, () => {
      const response = proxy(req(inputUrl));
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
  it("converts q=react to search=react for /vibes?format=json&q=react", () => {
    const response = proxy(req("https://vibetrends.dk/vibes?format=json&q=react"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    expect(rewriteHeader).not.toBeNull();
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("react");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("converts q=typescript to search=typescript for /skills?format=json&q=typescript", () => {
    const response = proxy(req("https://vibetrends.dk/skills?format=json&q=typescript"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("typescript");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("converts q=claude to search=claude for /agents?format=json&q=claude", () => {
    const response = proxy(req("https://vibetrends.dk/agents?format=json&q=claude"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("claude");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("converts q=cursor to search=cursor for /mcp?format=json&q=cursor", () => {
    const response = proxy(req("https://vibetrends.dk/mcp?format=json&q=cursor"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("cursor");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("converts q=npm to search=npm for /cli?format=json&q=npm", () => {
    const response = proxy(req("https://vibetrends.dk/cli?format=json&q=npm"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("npm");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
  });

  it("preserves other params alongside the alias (e.g. sort=top)", () => {
    const response = proxy(req("https://vibetrends.dk/vibes?format=json&q=react&sort=top"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    const rewriteUrl = new URL(rewriteHeader!);
    expect(rewriteUrl.searchParams.get("search")).toBe("react");
    expect(rewriteUrl.searchParams.get("sort")).toBe("top");
    expect(rewriteUrl.searchParams.has("q")).toBe(false);
    expect(rewriteUrl.searchParams.has("format")).toBe(false);
  });

  it("does not set search when q is absent — unfiltered catalog result", () => {
    const response = proxy(req("https://vibetrends.dk/vibes?format=json"));
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
  it("does not rewrite /vibes?q=react (human-facing route, no format=json)", () => {
    const response = proxy(req("https://vibetrends.dk/vibes?q=react"));
    // Should be NextResponse.next() — no rewrite header
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    expect(rewriteHeader).toBeNull();
  });

  it("does not add search to direct /api/vibes?q=react calls", () => {
    // Direct API calls are not caught by the format=json branch.
    const response = proxy(req("https://vibetrends.dk/api/vibes?q=react"));
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    expect(rewriteHeader).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Redirect rules — unchanged by this feature
// ---------------------------------------------------------------------------

describe("proxy — redirect rules are unaffected", () => {
  it("redirects /agents?category=MCP+Server to /mcp (308)", () => {
    const response = proxy(
      req("https://vibetrends.dk/agents?category=MCP+Server")
    );
    expect(response.status).toBe(308);
    const location = response.headers.get("location");
    expect(location).toContain("/mcp");
  });

  it("redirects /tool-clis to /cli (308)", () => {
    const response = proxy(req("https://vibetrends.dk/tool-clis"));
    expect(response.status).toBe(308);
    const location = response.headers.get("location");
    expect(location).toContain("/cli");
  });
});
