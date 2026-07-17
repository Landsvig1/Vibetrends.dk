import { NextResponse } from "next/server";
import { getFeedItems, type FeedItemType } from "@/lib/db";

const VALID_TYPES: FeedItemType[] = ["skill", "mcp", "cli", "vibe"];

/**
 * GET /api/feed — the Danish AI market feed (docs/marketing/market-feed-brief.md).
 *
 * Query params:
 *   since  ISO 8601 timestamp; only items published strictly after it.
 *   type   Comma-separated subset of skill,mcp,cli,vibe. Default: all.
 *   lang   da (default) | en.
 *   limit  1-100, default 50.
 *
 * Intended primary consumer is an agent polling on a schedule:
 *   GET /api/feed?since=2026-07-09T00:00:00Z
 * The same data is exposed as MCP tool `get_market_updates` on /api/mcp and
 * as RSS at /feed.xml.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const since = searchParams.get("since") ?? undefined;
  if (since && Number.isNaN(Date.parse(since))) {
    return NextResponse.json(
      { error: "Invalid 'since' — expected an ISO 8601 timestamp, e.g. 2026-07-09T00:00:00Z" },
      { status: 400 }
    );
  }

  const typeParam = searchParams.get("type");
  let types: FeedItemType[] | undefined;
  if (typeParam) {
    const requested = typeParam.split(",").map(t => t.trim().toLowerCase());
    const invalid = requested.filter(t => !VALID_TYPES.includes(t as FeedItemType));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid type(s): ${invalid.join(", ")}. Valid: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    types = requested as FeedItemType[];
  }

  const lang = searchParams.get("lang") === "en" ? "en" as const : "da" as const;
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) ? limitParam : undefined;

  const items = await getFeedItems({ since, types, lang, limit });

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: items.length, items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
