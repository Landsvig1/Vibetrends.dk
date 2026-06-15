import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple blocklist for malicious bots
const BLOCKED_AGENTS = [
  'GPTBot',
  'ClaudeBot',
  'AhrefsBot',
  'MJ12bot',
];

export function proxy(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;
  const format = searchParams.get('format');
  const userAgent = request.headers.get('user-agent') || '';
  
  // 1. Basic Bot/DDoS protection at the Edge
  if (BLOCKED_AGENTS.some(bot => userAgent.includes(bot))) {
    // Note: Blocking common crawlers can be useful if they bypass your AI rules
  }

  let response = NextResponse.next();

  // 2. Format Switching (?format=json)
  if (format === 'json') {
    const routeMap: Record<string, string> = {
      '/skills': '/api/skills',
      '/showcase': '/api/showcase',
      '/agents': '/api/agents',
      '/forum': '/api/forum',
    };

    const apiPath = routeMap[pathname];
    if (apiPath) {
      const url = request.nextUrl.clone();
      url.pathname = apiPath;
      url.searchParams.delete('format');
      response = NextResponse.rewrite(url);
    }
  }

  // 3. Agent Metadata Headers
  if (pathname.startsWith('/api') || format === 'json') {
    response.headers.set('X-Agent-Help', 'See /ai.txt for instructions or /ara.json for API mapping');
    response.headers.set('X-Capability-Card', '/capability.json');
    response.headers.set('X-LLM-LD', '/llm-ld.json');
    response.headers.set('X-RateLimit-Limit', '120');
    response.headers.set('X-RateLimit-Reset-Action', 'Wait 60s if 429 received');
  }

  return response;
}

export const config = {
  matcher: ['/skills', '/showcase', '/agents', '/forum', '/api/:path*'],
};
