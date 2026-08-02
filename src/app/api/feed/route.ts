import { NextResponse } from "next/server";
import { getFeedItems, type FeedItemType } from "@/lib/db";

const VALID_TYPES: FeedItemType[] = ["skill", "mcp", "cli", "vibe"];

/**
 * GET /api/feed — the Danish AI market feed (docs/marketing/market-feed-brief.md).
 *
 * Query params:
 *   since  ISO 8601 timestamp; only items published strictly after it. Maximum 100 characters.
 *   type   Comma-separated subset of skill,mcp,cli,vibe. Default: all. Maximum 100 characters.
 *   lang   da (default) | en. Maximum 10 characters.
 *   limit  1-100, default 50. Maximum 10 characters.
 *
 * Intended primary consumer is an agent polling on a schedule:
 *   GET /api/feed?since=2026-07-09T00:00:00Z
 * The same data is exposed as MCP tool `get_market_updates` on /api/mcp and
 * as RSS at /feed.xml.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const since = searchParams.get("since") ?? undefined;
  const typeParam = searchParams.get("type");
  const langParam = searchParams.get("lang");
  const limitStr = searchParams.get("limit");

  // Enforce strict string length limits on all query parameters (DoS and validation bypass hardening)
  if (
    (since && since.length > 100) ||
    (typeParam && typeParam.length > 100) ||
    (langParam && langParam.length > 10) ||
    (limitStr && limitStr.length > 10)
  ) {
    return NextResponse.json(
      { error: "Query parameter exceeds maximum length limit" },
      { status: 400 }
    );
  }

  if (since && Number.isNaN(Date.parse(since))) {
    return NextResponse.json(
      { error: "Invalid 'since' — expected an ISO 8601 timestamp, e.g. 2026-07-09T00:00:00Z" },
      { status: 400 }
    );
  }

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

  const lang = langParam === "en" ? "en" as const : "da" as const;

  // Properly parse limit to fall back to undefined (to use DB default 50) when absent/empty
  let limit: number | undefined;
  if (limitStr) {
    const limitParam = Number(limitStr);
    if (Number.isFinite(limitParam)) {
      limit = limitParam;
    }
  }

  const items = await getFeedItems({ since, types, lang, limit });

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: items.length, items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
