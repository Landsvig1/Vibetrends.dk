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

  const format = searchParams.get('format');

  let response = NextResponse.next();

  // 1. Format switching (?format=json) — content negotiation for agents.
  if (format === 'json') {
    const routeMap: Record<string, string> = {
      '/skills': '/api/skills',
      '/showcase': '/api/showcase',
      '/agents': '/api/agents',
      '/mcp': '/api/agents',
      '/forum': '/api/forum',
    };

    const apiPath = routeMap[pathname];
    if (apiPath) {
      const url = request.nextUrl.clone();
      url.pathname = apiPath;
      url.searchParams.delete('format');
      // MCP servers are agents filtered by category.
      if (pathname === '/mcp') url.searchParams.set('category', 'MCP Server');
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
  matcher: ['/skills', '/showcase', '/agents', '/mcp', '/forum', '/api/:path*'],
};
