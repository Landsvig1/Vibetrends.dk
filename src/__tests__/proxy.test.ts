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
  // Each test uses a distinct id: legacyAgentTarget memoises resolved answers
  // in a module-level map, so reusing an id would serve a prior test's result.

  it("sends a CLI row to /cli/:id with a real 308", async () => {
    stubAgentLookup([{ category: "CLI" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_cli_1"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cli/a_cli_1");
  });

  it("sends an MCP Server row to /mcp/:id", async () => {
    stubAgentLookup([{ category: "MCP Server" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_mcp_1"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/mcp/a_mcp_1");
  });

  // No /agents/[id] route exists behind these, so falling through means Next's
  // own router answers with a real 404 rather than a soft one.
  it("falls through to a 404 for a row that no longer exists", async () => {
    stubAgentLookup([]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_gone_1"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).not.toBe(503);
  });

  it("falls through for a Host row — hosts have no detail page to land on", async () => {
    stubAgentLookup([{ category: "Host" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_host_1"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).not.toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Lookup failure must not masquerade as "row is gone".
//
// A 404 tells a crawler the URL is permanently gone, so answering a transient
// Supabase failure with one deindexes a legacy URL that has a valid target —
// the exact opposite of what this redirect exists to do. An earlier revision
// collapsed both cases into `null` and did precisely that.
// ---------------------------------------------------------------------------

describe("proxy — /agents/:id distinguishes 'absent' from 'lookup failed'", () => {
  it("answers 503 with Retry-After when the lookup errors", async () => {
    stubAgentLookup(null);
    const response = await proxy(req("https://vibetrends.dk/agents/a_err_1"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("120");
  });

  it("answers 503 when the lookup throws rather than returning a status", async () => {
    stubSupabaseEnv();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const response = await proxy(req("https://vibetrends.dk/agents/a_err_2"));
    expect(response.status).toBe(503);
  });

  it("answers 503 — not 404 — when Supabase env vars are unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(req("https://vibetrends.dk/agents/a_err_3"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
  });

  it("does not cache a failure — a later success for the same id still redirects", async () => {
    stubAgentLookup(null);
    expect((await proxy(req("https://vibetrends.dk/agents/a_flap_1"))).status).toBe(503);

    stubAgentLookup([{ category: "CLI" }]);
    const recovered = await proxy(req("https://vibetrends.dk/agents/a_flap_1"));
    expect(recovered.status).toBe(308);
    expect(new URL(recovered.headers.get("location")!).pathname).toBe("/cli/a_flap_1");
  });
});

// ---------------------------------------------------------------------------
// Lookup caching — `agents` ids are immutable, so a resolved answer stays true.
// Caching misses is the part that matters: it stops someone enumerating the
// retired namespace from turning each cheap 404 into a Supabase round-trip.
// ---------------------------------------------------------------------------

describe("proxy — /agents/:id caches resolved lookups", () => {
  it("does not re-query for a repeated hit", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ category: "CLI" }]), { status: 200 }));
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    await proxy(req("https://vibetrends.dk/agents/a_cache_hit"));
    await proxy(req("https://vibetrends.dk/agents/a_cache_hit"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-query for a repeated miss — the enumeration guard", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    await proxy(req("https://vibetrends.dk/agents/a_cache_miss"));
    await proxy(req("https://vibetrends.dk/agents/a_cache_miss"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Id encoding. `pathname` arrives already percent-encoded, so the id has to be
// decoded before being re-encoded into the PostgREST filter — encoding it
// twice escapes the escapes and turns a legal spelling of a real id into a miss.
// ---------------------------------------------------------------------------

describe("proxy — /agents/:id encodes the lookup filter exactly once", () => {
  it("resolves a percent-encoded spelling of a real id", async () => {
    const fetchMock = vi.fn<(url: string | URL) => Promise<Response>>(
      async () => new Response(JSON.stringify([{ category: "CLI" }]), { status: 200 })
    );
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    // "a%5F123" is a legal encoding of "a_123". Double-encoding would query for
    // the literal string "a%5F123", miss, and 404 a URL that has a target.
    const response = await proxy(req("https://vibetrends.dk/agents/a%5F123"));

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.searchParams.get("id")).toBe("eq.a_123");
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cli/a_123");
  });

  it("keeps a crafted id inside the id filter instead of starting a new parameter", async () => {
    const fetchMock = vi.fn<(url: string | URL) => Promise<Response>>(
      async () => new Response("[]", { status: 200 })
    );
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);
    await proxy(req("https://vibetrends.dk/agents/a_2%26select=*"));

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect([...requested.searchParams.keys()]).toEqual(["id", "select", "limit"]);
    expect(requested.searchParams.get("id")).toBe("eq.a_2&select=*");
    expect(requested.searchParams.get("select")).toBe("category");
  });

  it("treats malformed percent-encoding as a miss rather than throwing", async () => {
    const fetchMock = vi.fn();
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(req("https://vibetrends.dk/agents/a_bad%ZZ"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).not.toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });
});
