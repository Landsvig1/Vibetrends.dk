import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Outcome of resolving a legacy /agents/:id.
 *
 * `absent` and `unavailable` must stay distinct. Collapsing them (as an earlier
 * revision did, by returning null for both) means a Supabase blip answers a
 * legacy URL that has a perfectly good target with a 404 — the opposite of the
 * consolidation this redirect exists to produce.
 */
type LegacyAgentLookup =
  | { status: 'found'; target: string }
  | { status: 'absent' }
  | { status: 'unavailable' };

/**
 * `agents` ids are immutable, so a resolved answer stays true. Cache both hits
 * and misses: caching misses is what stops someone enumerating the retired
 * namespace from turning each cheap 404 into a Supabase round-trip. Never cache
 * `unavailable` — a transient failure must not pin itself in memory.
 *
 * A module-level Map rather than `next: { revalidate }` because proxy runs
 * outside the Data Cache, so fetch-level cache options are silently inert here.
 * Bounded so the map itself can't become the amplification vector.
 */
const LOOKUP_TTL_MS = 60 * 60 * 1000;
const LOOKUP_CACHE_MAX = 500;
const lookupCache = new Map<string, { result: LegacyAgentLookup; expires: number }>();

function readCache(id: string): LegacyAgentLookup | undefined {
  const hit = lookupCache.get(id);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    lookupCache.delete(id);
    return undefined;
  }
  return hit.result;
}

function writeCache(id: string, result: LegacyAgentLookup): void {
  if (result.status === 'unavailable') return;
  // Map preserves insertion order, so the first key is the oldest.
  if (lookupCache.size >= LOOKUP_CACHE_MAX) {
    const oldest = lookupCache.keys().next().value;
    if (oldest !== undefined) lookupCache.delete(oldest);
  }
  lookupCache.set(id, { result, expires: Date.now() + LOOKUP_TTL_MS });
}

/**
 * Where a legacy /agents/:id should land.
 *
 * This has to happen in proxy rather than in an app route. With cacheComponents
 * the root layout's Suspense shell is prerendered and flushed before any page
 * code runs, so a redirect()/notFound() thrown from a server component can only
 * be streamed into an already-sent 200 — Google sees a soft redirect and never
 * consolidates the old URL. Measured against a production build: an app-route
 * version of this returned 200. Only proxy runs early enough to set a real 308.
 *
 * There is deliberately no app/agents/[id] route behind this. Without one, an
 * `absent` result falls through to Next's own router and gets a real 404
 * status, which is again something an app route could not produce.
 *
 * The lookup cost is acceptable *here specifically* because /agents/:id is dead
 * URL space after the retirement: crawler traffic on legacy links, not the hot
 * path. Do not copy this pattern onto the live detail routes.
 */
async function legacyAgentTarget(rawId: string): Promise<LegacyAgentLookup> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Without credentials the answer is unknown, not "no such row" — a preview
  // deploy missing env vars must not 404 the whole legacy namespace.
  if (!base || !key) return { status: 'unavailable' };

  // `pathname` is already percent-encoded, so re-encoding it directly would
  // escape the escapes: "a%5F123" (a legal spelling of "a_123") would query for
  // a literal "a%5F123" and miss. Decode first, then encode exactly once.
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    // Malformed percent-encoding can never name a real row.
    return { status: 'absent' };
  }

  const cached = readCache(id);
  if (cached) return cached;

  let result: LegacyAgentLookup;
  try {
    const res = await fetch(
      `${base}/rest/v1/agents?id=eq.${encodeURIComponent(id)}&select=category&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        // A slow lookup must not hold up the response.
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!res.ok) {
      result = { status: 'unavailable' };
    } else {
      const rows: unknown = await res.json();
      const category = Array.isArray(rows) ? rows[0]?.category : undefined;
      // Host rows are connection targets with no detail page, same as a row
      // that no longer exists — nothing to redirect to.
      result =
        !category || category === 'Host'
          ? { status: 'absent' }
          : {
              status: 'found',
              target: category === 'MCP Server' ? `/mcp/${id}` : `/cli/${id}`,
            };
    }
  } catch {
    result = { status: 'unavailable' };
  }

  writeCache(id, result);
  return result;
}

export async function proxy(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;

  // MCP servers moved from a query-param filter on /agents to a first-class /mcp.
  // searchParams.get() returns the decoded value, so this matches the encoded form too.
  if (pathname === '/agents' && searchParams.get('category') === 'MCP Server') {
    const url = request.nextUrl.clone();
    url.pathname = '/mcp';
    url.searchParams.delete('category');
    return NextResponse.redirect(url, 308);
  }

  // /agents duplicated /cli — the default catalog excludes Host and MCP Server,
  // so the hub listed exactly the CLI rows under a second canonical. Retired in
  // favour of /cli.
  //
  // Ordering matters twice over. It must sit *after* the ?category= check above,
  // which has its own target. And it belongs in proxy rather than next.config:
  // Next resolves config `redirects` (step 2) before proxy (step 3), so the same
  // rule expressed there would fire first and swallow the ?category= case.
  if (pathname === '/agents') {
    const url = request.nextUrl.clone();
    url.pathname = '/cli';
    return NextResponse.redirect(url, 308);
  }

  // Per-row target, so this one needs a lookup.
  if (pathname.startsWith('/agents/')) {
    const lookup = await legacyAgentTarget(pathname.slice('/agents/'.length));

    if (lookup.status === 'found') {
      const url = request.nextUrl.clone();
      url.pathname = lookup.target;
      return NextResponse.redirect(url, 308);
    }

    // Couldn't reach Supabase. 503 rather than falling through, because falling
    // through means a 404 and a 404 tells a crawler this URL is permanently
    // gone — deindexing a legacy link that has a valid target, over a blip.
    // 503 + Retry-After asks it to come back instead, and caches nothing.
    if (lookup.status === 'unavailable') {
      return new NextResponse('Kunne ikke slå op lige nu. Prøv igen om lidt.', {
        status: 503,
        headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' },
      });
    }

    // `absent` falls through: no /agents/[id] route exists, so Next answers
    // with a real 404, which is the correct answer for a row that is gone.
  }

  // The tool-CLI feed was renamed to /cli (matching /mcp). Preserve old links.
  if (pathname === '/tool-clis' || pathname.startsWith('/tool-clis/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace('/tool-clis', '/cli');
    return NextResponse.redirect(url, 308);
  }

  const format = searchParams.get('format');

  let response = NextResponse.next();

  // 1. Format switching (?format=json) — content negotiation for agents.
  if (format === 'json') {
    const routeMap: Record<string, string> = {
      '/skills': '/api/skills',
      '/vibes': '/api/vibes',
      // No '/agents' entry: the page is gone (redirected to /cli above, so
      // this map never sees it) and the path was never documented in
      // public/ai.txt — only POST /api/agents is, and that route is untouched.
      // /mcp and /cli each have a param-free JSON route: rewrite() keeps
      // the original request query, so we can't inject ?category onto
      // /api/agents here.
      '/mcp': '/api/mcp-servers',
      '/cli': '/api/cli',
      '/forum': '/api/forum',
    };

    const apiPath = routeMap[pathname];
    if (apiPath) {
      const url = request.nextUrl.clone();
      url.pathname = apiPath;
      url.searchParams.delete('format');
      // The client search box binds to ?q= (nuqs useQueryState("q")), but all
      // API route handlers read searchParams.get("search"). Alias q→search here
      // so agent/crawler callers following ai.txt's documented ?format=json path
      // get correctly filtered results without touching the API handlers or db.ts.
      // Only applies to format=json rewrites — the human-facing client route is
      // unaffected (the client island manages the q param itself via nuqs).
      const q = url.searchParams.get('q');
      if (q !== null) {
        url.searchParams.set('search', q);
        url.searchParams.delete('q');
      }
      response = NextResponse.rewrite(url);
    }
  }

  // 2. Agent metadata + open read access. The public API is read-only data, so
  //    allow cross-origin reads (no credentials) for browser-based agents/tools.
  //    Mutations stay protected by the Supabase session cookie in each handler,
  //    which a wildcard ACAO cannot expose (credentialed reads require an exact
  //    origin, which we never send).
  if (pathname.startsWith('/api') || format === 'json') {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('X-Agent-Help', 'See /ai.txt for instructions or /ara.json for API mapping');
    response.headers.set('X-Capability-Card', '/capability.json');
    response.headers.set('X-LLM-LD', '/llm-ld.json');
  }

  return response;
}

export const config = {
  matcher: ['/skills', '/vibes', '/agents', '/agents/:path*', '/mcp', '/cli', '/tool-clis', '/tool-clis/:path*', '/forum', '/api/:path*'],
};
