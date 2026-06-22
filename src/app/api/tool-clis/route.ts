import { NextResponse } from "next/server";
import { getToolClis } from "@/lib/db";
import { cookies } from "next/headers";

// JSON twin of the /tool-clis page. Tool-CLIs are agents with category
// 'Tool CLI'. This is a dedicated, param-free route because the proxy's
// ?format=json rewrite keeps the original request query, so a category
// injected onto the rewrite destination would be dropped — mirroring
// /api/mcp-servers.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const toolClis = await getToolClis(search, lang);
  return NextResponse.json(toolClis, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}
