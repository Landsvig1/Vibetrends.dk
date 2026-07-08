import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;

  // MCP servers moved from a query-param filter on /agents to a first-class /mcp.
  // searchParams.get() returns the decoded value, so this matches the encoded form too.
  if (pathname === '/agents' && searchParams.get('category') === 'MCP Server') {
    const url = request.nextUrl.clone();
    url.pathname = '/mcp';
    url.searchParams.delete('category');
    return NextResponse.redirect(url, 308);
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
      '/agents': '/api/agents',
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
  matcher: ['/skills', '/vibes', '/agents', '/mcp', '/cli', '/tool-clis', '/tool-clis/:path*', '/forum', '/api/:path*'],
};
