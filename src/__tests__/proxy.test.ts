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
 * Stub the PostgREST call catalogTarget() makes. Returns the rows the lookup
 * should see; pass `null` to simulate an unreachable/erroring Supabase.
 */
function stubAgentLookup(rows: { category?: string; slug?: string | null }[] | null) {
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

/** catalogTarget() no-ops without these, so the lookup tests must set them. */
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

  // Straight to the slug, in one hop. Targeting /cli/:id instead would bounce
  // off the id resolver and cost every retired link a second redirect.
  it("sends a CLI row to /cli/{slug} with a real 308", async () => {
    stubAgentLookup([{ category: "CLI", slug: "claude-code" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_cli_1"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cli/claude-code");
  });

  it("sends an MCP Server row to /mcp/{slug}", async () => {
    stubAgentLookup([{ category: "MCP Server", slug: "supabase-mcp" }]);
    const response = await proxy(req("https://vibetrends.dk/agents/a_mcp_1"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/mcp/supabase-mcp");
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
    stubAgentLookup([{ category: "Host", slug: "some-host" }]);
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

    stubAgentLookup([{ category: "CLI", slug: "flappy" }]);
    const recovered = await proxy(req("https://vibetrends.dk/agents/a_flap_1"));
    expect(recovered.status).toBe(308);
    expect(new URL(recovered.headers.get("location")!).pathname).toBe("/cli/flappy");
  });
});

// ---------------------------------------------------------------------------
// Lookup caching — `agents` ids are immutable, so a resolved answer stays true.
// Caching misses is the part that matters: it stops someone enumerating the
// retired namespace from turning each cheap 404 into a Supabase round-trip.
// ---------------------------------------------------------------------------

describe("proxy — /agents/:id caches resolved lookups", () => {
  it("does not re-query for a repeated hit", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ category: "CLI", slug: "cached-cli" }]), { status: 200 }));
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
      async () => new Response(JSON.stringify([{ category: "CLI", slug: "encoded-cli" }]), { status: 200 })
    );
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    // "a%5F123" is a legal encoding of "a_123". Double-encoding would query for
    // the literal string "a%5F123", miss, and 404 a URL that has a target.
    const response = await proxy(req("https://vibetrends.dk/agents/a%5F123"));

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.searchParams.get("id")).toBe("eq.a_123");
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cli/encoded-cli");
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
    expect(requested.searchParams.get("select")).toBe("slug,category");
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

// ---------------------------------------------------------------------------
// Catalog detail URLs still on their pre-slug id — the Phase B redirect.
//
// Same reasoning as /agents/:id above, and the same reason it cannot live in
// the page: under cacheComponents a redirect thrown from a server component is
// streamed into an already-sent 200 and Google reads it as a soft redirect. The
// 308 status itself is asserted against a production build in the PR; what
// these cover is the routing logic — which requests trigger a lookup at all,
// and what each outcome maps to.
// ---------------------------------------------------------------------------

describe("proxy — /skills, /vibes, /cli, /mcp resolve an id to its slug", () => {
  it("308s /skills/{id} to /skills/{slug}", async () => {
    stubAgentLookup([{ slug: "seo-geo" }]);
    const response = await proxy(req("https://vibetrends.dk/skills/s_1785096155359"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/skills/seo-geo");
  });

  it("308s /vibes/{id} to /vibes/{slug}", async () => {
    stubAgentLookup([{ slug: "dansk-designsystem" }]);
    const response = await proxy(req("https://vibetrends.dk/vibes/p_1785096155359"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/vibes/dansk-designsystem");
  });

  it("308s a legacy seed_ id", async () => {
    stubAgentLookup([{ slug: "skill-creator" }]);
    const response = await proxy(req("https://vibetrends.dk/skills/seed_skill_creator"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/skills/skill-creator");
  });

  it("queries the table that matches the surface", async () => {
    const fetchMock = vi.fn<(url: string | URL) => Promise<Response>>(
      async () => new Response(JSON.stringify([{ slug: "a-vibe" }]), { status: 200 })
    );
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    await proxy(req("https://vibetrends.dk/vibes/p_2001"));
    expect(String(fetchMock.mock.calls[0][0])).toContain("/rest/v1/vibes?");
    // vibes has no `category` column — selecting one would 400 the request.
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("select")).toBe("slug");
  });

  // The gate that makes this affordable on a live route at all.
  it("does not query Supabase for a slug request — the hot path stays free", async () => {
    const fetchMock = vi.fn();
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(req("https://vibetrends.dk/skills/seo-geo"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  // slugify can emit "s-123" but never "s_123", so an ID-looking slug is served
  // directly rather than sent round the lookup and into a redirect loop.
  it("serves a hyphenated ID-lookalike slug directly", async () => {
    const fetchMock = vi.fn();
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(req("https://vibetrends.dk/skills/s-1785096155359"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not query for /skills/topic/{slug} — a sibling static segment, not a detail id", async () => {
    const fetchMock = vi.fn();
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(req("https://vibetrends.dk/skills/topic/agent-methodology"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("falls through to a 404 for an ID-shaped param naming no row", async () => {
    stubAgentLookup([]);
    const response = await proxy(req("https://vibetrends.dk/skills/s_9999999999999"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).not.toBe(503);
  });

  it("answers 503 — not 404 — when the lookup fails", async () => {
    stubAgentLookup(null);
    const response = await proxy(req("https://vibetrends.dk/skills/s_5550000000001"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("120");
  });

  it("answers 503 when Supabase credentials are absent — a preview deploy must not 404 the namespace", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await proxy(req("https://vibetrends.dk/skills/s_5550000000002"));
    expect(response.status).toBe(503);
  });

  it("answers 503 when the lookup times out", async () => {
    stubSupabaseEnv();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }));
    const response = await proxy(req("https://vibetrends.dk/skills/s_5550000000003"));
    expect(response.status).toBe(503);
  });

  // Only reachable between the column landing and the backfill running. 503 asks
  // the crawler back; a 404 would tell it a live page is permanently gone.
  it("answers 503 for a row that exists but has no slug yet", async () => {
    stubAgentLookup([{ slug: null }]);
    const response = await proxy(req("https://vibetrends.dk/skills/s_5550000000004"));
    expect(response.status).toBe(503);
  });

  it("sends an id requested under the wrong surface to the right one in one hop", async () => {
    stubAgentLookup([{ category: "MCP Server", slug: "supabase-mcp" }]);
    const response = await proxy(req("https://vibetrends.dk/cli/a_1785096155001"));
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/mcp/supabase-mcp");
  });

  it("namespaces the lookup cache by table — the same seed_ id can exist in two tables", async () => {
    const fetchMock = vi.fn<(url: string | URL) => Promise<Response>>(async (url) =>
      new Response(
        JSON.stringify([{ slug: String(url).includes("/skills") ? "from-skills" : "from-vibes" }]),
        { status: 200 }
      )
    );
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    const fromSkills = await proxy(req("https://vibetrends.dk/skills/seed_shared_id"));
    const fromVibes = await proxy(req("https://vibetrends.dk/vibes/seed_shared_id"));

    expect(new URL(fromSkills.headers.get("location")!).pathname).toBe("/skills/from-skills");
    expect(new URL(fromVibes.headers.get("location")!).pathname).toBe("/vibes/from-vibes");
  });

  it("resolves a percent-encoded spelling of an id rather than 404ing it", async () => {
    const fetchMock = vi.fn<(url: string | URL) => Promise<Response>>(
      async () => new Response(JSON.stringify([{ slug: "encoded-skill" }]), { status: 200 })
    );
    stubSupabaseEnv();
    vi.stubGlobal("fetch", fetchMock);

    // "s%5F1" is a legal encoding of "s_1" — the gate has to test the decoded form.
    const response = await proxy(req("https://vibetrends.dk/skills/s%5F1785096155360"));

    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("id")).toBe("eq.s_1785096155360");
    expect(new URL(response.headers.get("location")!).pathname).toBe("/skills/encoded-skill");
  });
});
