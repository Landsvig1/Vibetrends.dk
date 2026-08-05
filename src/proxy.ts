import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Outcome of resolving a catalog id (a legacy /agents/:id, or an /skills,
 * /vibes, /cli, /mcp detail URL still on its pre-slug id).
 *
 * `absent` and `unavailable` must stay distinct. Collapsing them (as an earlier
 * revision did, by returning null for both) means a Supabase blip answers a
 * legacy URL that has a perfectly good target with a 404 — the opposite of the
 * consolidation this redirect exists to produce.
 */
type CatalogLookup =
  | { status: 'found'; target: string }
  | { status: 'absent' }
  | { status: 'unavailable' };

/**
 * Catalog ids are immutable and slugs never change once assigned, so a resolved
 * answer stays true. Cache both hits and misses: caching misses is what stops
 * someone enumerating the id space from turning each cheap 404 into a Supabase
 * round-trip. Never cache `unavailable` — a transient failure must not pin
 * itself in memory.
 *
 * A module-level Map rather than `next: { revalidate }` because proxy runs
 * outside the Data Cache, so fetch-level cache options are silently inert here.
 * Bounded so the map itself can't become the amplification vector.
 *
 * Keys are namespaced by table: `seed_*` ids carry no table prefix, so the same
 * id string can legitimately exist in two tables.
 */
const LOOKUP_TTL_MS = 60 * 60 * 1000;
const LOOKUP_CACHE_MAX = 500;
const lookupCache = new Map<string, { result: CatalogLookup; expires: number }>();

function readCache(key: string): CatalogLookup | undefined {
  const hit = lookupCache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    lookupCache.delete(key);
    return undefined;
  }
  return hit.result;
}

function writeCache(key: string, result: CatalogLookup): void {
  if (result.status === 'unavailable') return;
  // Map preserves insertion order, so the first key is the oldest.
  if (lookupCache.size >= LOOKUP_CACHE_MAX) {
    const oldest = lookupCache.keys().next().value;
    if (oldest !== undefined) lookupCache.delete(oldest);
  }
  lookupCache.set(key, { result, expires: Date.now() + LOOKUP_TTL_MS });
}

/**
 * The shapes a legacy/primary-key id can take: `s_`/`p_`/`a_` + epoch from the
 * create paths in src/lib/db.ts, or a legacy `seed_` id.
 *
 * This gate is what makes running the resolver on the *live* detail routes
 * affordable, against the standing warning below. slugify (src/lib/slug.ts)
 * folds every non-alphanumeric to a hyphen and can never emit an underscore, so
 * no generated slug matches this pattern — slug requests, the hot path, fall
 * straight through with no Supabase call. src/lib/__tests__/slug.test.ts
 * asserts that property directly against this regex.
 */
const ID_SHAPE = /^(s_\d+|p_\d+|a_\d+|seed_)/;

/**
 * The form of a path segment to test ID_SHAPE against.
 *
 * `pathname` is percent-encoded, and "s%5F123" is a legal spelling of "s_123" —
 * testing the raw segment would let that spelling slip past the gate and get
 * answered by the slug route as a 404. Undecodable input can't name a row
 * anyway, so it falls back to the raw segment and fails the test.
 */
function decodeIdShape(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Tables a catalog id can be resolved against. */
type CatalogTable = 'skills' | 'vibes' | 'agents';

/**
 * Where an id-shaped catalog URL should land.
 *
 * This has to happen in proxy rather than in an app route. With cacheComponents
 * the root layout's Suspense shell is prerendered and flushed before any page
 * code runs, so a redirect()/notFound() thrown from a server component can only
 * be streamed into an already-sent 200 — Google sees a soft redirect and never
 * consolidates the old URL. Measured against a production build: an app-route
 * version of this returned 200. Only proxy runs early enough to set a real 308.
 *
 * There is deliberately no app/agents/[id] route behind the legacy namespace.
 * Without one, an `absent` result falls through to Next's own router and gets a
 * real 404 status, which is again something an app route could not produce. The
 * live detail routes are slug-only for the same reason: an id that reaches them
 * is a matcher bug, not a case for the page to handle.
 *
 * The lookup cost was originally justified by /agents/:id being dead URL space.
 * On the live routes it is instead bounded by the ID_SHAPE gate at the call
 * site: only pre-slug ids pay for a round trip, and those are crawler traffic
 * on already-indexed URLs, not the hot path. Do not widen that gate.
 */
async function catalogTarget(
  table: CatalogTable,
  rawId: string,
  /** Builds the redirect target from the row. Return null for "no detail page". */
  targetFor: (row: { slug?: string | null; category?: string }) => string | null
): Promise<CatalogLookup> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Without credentials the answer is unknown, not "no such row" — a preview
  // deploy missing env vars must not 404 a whole namespace.
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

  const cacheKey = `${table}:${id}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  // `agents` needs the category to pick between /cli and /mcp; the other two
  // tables have no such column and selecting it would 400 the request.
  const columns = table === 'agents' ? 'slug,category' : 'slug';

  let result: CatalogLookup;
  try {
    const res = await fetch(
      `${base}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=${columns}&limit=1`,
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
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row) {
        result = { status: 'absent' };
      } else if (!row.slug) {
        // The row exists but has no slug yet — only possible in the window
        // between the column landing and scripts/backfill-slugs.mjs running.
        // 503 rather than 404: the URL is live, the answer is just not ready,
        // and a 404 here would tell a crawler a real page is permanently gone.
        result = { status: 'unavailable' };
      } else {
        const target = targetFor(row);
        result = target ? { status: 'found', target } : { status: 'absent' };
      }
    }
  } catch {
    result = { status: 'unavailable' };
  }

  writeCache(cacheKey, result);
  return result;
}

/**
 * /cli and /mcp are two surfaces over one table, so the row's own category —
 * not the requested path — decides where its id lands. That also means an id
 * requested under the wrong surface redirects to the right one in a single hop.
 *
 * Host rows are connection targets with no detail page, same as a row that no
 * longer exists: nothing to redirect to.
 */
function agentSlugTarget(row: { slug?: string | null; category?: string }): string | null {
  if (!row.slug || row.category === 'Host') return null;
  return row.category === 'MCP Server' ? `/mcp/${row.slug}` : `/cli/${row.slug}`;
}

/** The detail surfaces whose ids the proxy resolves, keyed by path prefix. */
const CATALOG_SURFACES: ReadonlyArray<{
  prefix: string;
  table: CatalogTable;
  targetFor: (row: { slug?: string | null; category?: string }) => string | null;
}> = [
  { prefix: '/skills', table: 'skills', targetFor: (row) => (row.slug ? `/skills/${row.slug}` : null) },
  { prefix: '/vibes', table: 'vibes', targetFor: (row) => (row.slug ? `/vibes/${row.slug}` : null) },
  { prefix: '/cli', table: 'agents', targetFor: agentSlugTarget },
  { prefix: '/mcp', table: 'agents', targetFor: agentSlugTarget },
];

/** 503 + Retry-After: ask a crawler to come back rather than let a blip 404 a live URL. */
function unavailableResponse(): NextResponse {
  return new NextResponse('Kunne ikke slå op lige nu. Prøv igen om lidt.', {
    status: 503,
    headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' },
  });
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

  // Per-row target, so this one needs a lookup. Points straight at the slug:
  // routing it to /cli/{id} instead would just bounce off the id resolver
  // below and cost a second redirect on every retired link.
  if (pathname.startsWith('/agents/')) {
    const lookup = await catalogTarget('agents', pathname.slice('/agents/'.length), agentSlugTarget);

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
      return unavailableResponse();
    }

    // `absent` falls through: no /agents/[id] route exists, so Next answers
    // with a real 404, which is the correct answer for a row that is gone.
  }

  // Detail URLs still on their pre-slug id: /skills/s_1785096155359 →
  // /skills/{slug}. Issued here rather than from the page because under
  // cacheComponents a page-level redirect can only ever be a soft 200 (see
  // catalogTarget). App routes are slug-only, so anything the gate below
  // rejects falls through and is answered by the slug lookup or a real 404.
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 2) {
    const surface = CATALOG_SURFACES.find((s) => s.prefix === `/${segments[0]}`);
    // ID_SHAPE is the whole reason this is affordable on a live route: a slug
    // can never match it, so the common case costs no Supabase call at all.
    if (surface && ID_SHAPE.test(decodeIdShape(segments[1]))) {
      const lookup = await catalogTarget(surface.table, segments[1], surface.targetFor);

      if (lookup.status === 'found') {
        const url = request.nextUrl.clone();
        url.pathname = lookup.target;
        return NextResponse.redirect(url, 308);
      }

      if (lookup.status === 'unavailable') {
        return unavailableResponse();
      }

      // `absent` falls through to the slug route, which 404s — the right answer
      // for an id that names no row.
    }
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

/**
 * The detail paths (`/skills/:path*` and friends) are matched so the id → slug
 * resolver can run. They cost nothing on the hot path: the handler's ID_SHAPE
 * gate rejects every slug request before any Supabase call, and /skills/topic/*
 * has three segments so it never reaches the gate at all.
 */
export const config = {
  matcher: [
    '/skills',
    '/skills/:path*',
    '/vibes',
    '/vibes/:path*',
    '/agents',
    '/agents/:path*',
    '/mcp',
    '/mcp/:path*',
    '/cli',
    '/cli/:path*',
    '/tool-clis',
    '/tool-clis/:path*',
    '/forum',
    '/api/:path*',
  ],
};
