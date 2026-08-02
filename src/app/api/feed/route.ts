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

  // SECURITY: Enforce strict length limits on public, unauthenticated search parameters
  // to prevent Denial of Service (DoS) and Regular Expression Denial of Service (ReDoS)
  // during expensive parsing/date parsing operations downstream.

  const since = searchParams.get("since") ?? undefined;
  if (since !== undefined) {
    if (since.length > 100) {
      return NextResponse.json(
        { error: "Invalid 'since' parameter length (max 100 characters)" },
        { status: 400 }
      );
    }
    if (Number.isNaN(Date.parse(since))) {
      return NextResponse.json(
        { error: "Invalid 'since' — expected an ISO 8601 timestamp, e.g. 2026-07-09T00:00:00Z" },
        { status: 400 }
      );
    }
  }

  const typeParam = searchParams.get("type") ?? undefined;
  let types: FeedItemType[] | undefined;
  if (typeParam !== undefined) {
    if (typeParam.length > 100) {
      return NextResponse.json(
        { error: "Invalid 'type' parameter length (max 100 characters)" },
        { status: 400 }
      );
    }
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

  const langParam = searchParams.get("lang") ?? undefined;
  if (langParam !== undefined) {
    if (langParam.length > 10) {
      return NextResponse.json(
        { error: "Invalid 'lang' parameter length (max 10 characters)" },
        { status: 400 }
      );
    }
  }
  const lang = langParam === "en" ? ("en" as const) : ("da" as const);

  // SECURITY: Mitigate bug where missing/empty limit query parameters coerce to 0 via `Number(null)`
  // which then clamps to 1 inside the data layer. Instead, default to undefined to allow the
  // data layer to resolve it to the standard limit (50).
  const limitParam = searchParams.get("limit");
  let limit: number | undefined = undefined;

  if (limitParam !== null && limitParam !== "") {
    if (limitParam.length > 10) {
      return NextResponse.json(
        { error: "Invalid 'limit' parameter length (max 10 characters)" },
        { status: 400 }
      );
    }
    const parsedLimit = Number(limitParam);
    if (!Number.isFinite(parsedLimit)) {
      return NextResponse.json(
        { error: "Invalid 'limit' format — expected a finite number" },
        { status: 400 }
      );
    }
    limit = parsedLimit;
  }

  const items = await getFeedItems({ since, types, lang, limit });

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: items.length, items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
