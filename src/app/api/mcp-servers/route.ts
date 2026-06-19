import { NextResponse } from "next/server";
import { getAgents } from "@/lib/db";
import { cookies } from "next/headers";

// JSON twin of the /mcp page. MCP servers are agents with category 'MCP Server'.
// This is a dedicated, param-free route because NextResponse.rewrite keeps the
// original request query, so a category injected onto the rewrite destination
// would be dropped. (/api/mcp is already the MCP tool-protocol endpoint.)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const agents = await getAgents(search, "MCP Server", lang);
  return NextResponse.json(agents, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}
