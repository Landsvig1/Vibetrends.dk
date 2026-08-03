import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Where a legacy /agents/:id should land, or null if it has no home.
 *
 * This has to happen in proxy rather than in an app route. With cacheComponents
 * the root layout's Suspense shell is prerendered and flushed before any page
 * code runs, so a redirect()/notFound() thrown from a server component can only
 * be streamed into an already-sent 200 — Google sees a soft redirect and never
 * consolidates the old URL. Measured against a production build: an app-route
 * version of this returned 200. Only proxy runs early enough to set a real 308.
 *
 * There is deliberately no app/agents/[id] route behind this. Without one, a
 * miss falls through to Next's own router and gets a real 404 status, which is
 * again something an app route could not produce.
 *
 * The lookup cost is acceptable *here specifically* because /agents/:id is dead
 * URL space after the retirement: crawler traffic on legacy links, not the hot
 * path. Do not copy this pattern onto the live detail routes.
 */
async function legacyAgentTarget(id: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  try {
    const res = await fetch(
      `${base}/rest/v1/agents?id=eq.${encodeURIComponent(id)}&select=category&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        // Well under any sane edge budget: a slow lookup must not hold up the
        // response. Falling through to the app route is the safe failure mode.
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return null;

    const rows: unknown = await res.json();
    const category = Array.isArray(rows) ? rows[0]?.category : undefined;
    // Host rows are connection targets with no detail page, same as a row that
    // no longer exists — nothing to redirect to.
    if (!category || category === 'Host') return null;

    return category === 'MCP Server' ? `/mcp/${id}` : `/cli/${id}`;
  } catch {
    return null;
  }
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
  // favour of /cli. Must sit *after* the category check above (that query-param
  // form has its own target) and stay in proxy rather than next.config, since
  // config-level redirects run first and would swallow it.
  if (pathname === '/agents') {
    const url = request.nextUrl.clone();
    url.pathname = '/cli';
    return NextResponse.redirect(url, 308);
  }

  // Per-row target, so this one needs a lookup. On a miss (deleted row, Host
  // row, or a failed lookup) fall through — there is no /agents/[id] route, so
  // Next answers with a real 404.
  if (pathname.startsWith('/agents/')) {
    const target = await legacyAgentTarget(pathname.slice('/agents/'.length));
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url, 308);
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

export const config = {
  matcher: ['/skills', '/vibes', '/agents', '/agents/:path*', '/mcp', '/cli', '/tool-clis', '/tool-clis/:path*', '/forum', '/api/:path*'],
};
