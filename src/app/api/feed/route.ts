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

  // Retrieve raw parameter strings for strict length validation to mitigate DoS/resource exhaustion
  const rawSince = searchParams.get("since");
  const rawType = searchParams.get("type");
  const rawLang = searchParams.get("lang");
  const rawLimit = searchParams.get("limit");

  if (rawSince && rawSince.length > 100) {
    return NextResponse.json(
      { error: "Parameter 'since' exceeds length limit of 100 characters" },
      { status: 400 }
    );
  }
  if (rawType && rawType.length > 100) {
    return NextResponse.json(
      { error: "Parameter 'type' exceeds length limit of 100 characters" },
      { status: 400 }
    );
  }
  if (rawLang && rawLang.length > 10) {
    return NextResponse.json(
      { error: "Parameter 'lang' exceeds length limit of 10 characters" },
      { status: 400 }
    );
  }
  if (rawLimit && rawLimit.length > 10) {
    return NextResponse.json(
      { error: "Parameter 'limit' exceeds length limit of 10 characters" },
      { status: 400 }
    );
  }

  const since = rawSince && rawSince !== "" ? rawSince : undefined;
  if (since && Number.isNaN(Date.parse(since))) {
    return NextResponse.json(
      { error: "Invalid 'since' — expected an ISO 8601 timestamp, e.g. 2026-07-09T00:00:00Z" },
      { status: 400 }
    );
  }

  let types: FeedItemType[] | undefined;
  if (rawType && rawType !== "") {
    const requested = rawType.split(",").map(t => t.trim().toLowerCase());
    const invalid = requested.filter(t => !VALID_TYPES.includes(t as FeedItemType));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid type(s): ${invalid.join(", ")}. Valid: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    types = requested as FeedItemType[];
  }

  const lang = rawLang === "en" ? "en" as const : "da" as const;

  let limit: number | undefined = undefined;
  if (rawLimit !== null && rawLimit !== "") {
    const limitParam = Number(rawLimit);
    if (!Number.isFinite(limitParam)) {
      return NextResponse.json(
        { error: "Invalid 'limit' parameter — must be a number" },
        { status: 400 }
      );
    }
    limit = limitParam;
  }

  const items = await getFeedItems({ since, types, lang, limit });

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: items.length, items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
