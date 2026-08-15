import { NextResponse } from "next/server";
import { getVercelOidcToken } from "@vercel/oidc";
import { isBearerAuthorized } from "@/lib/bearerAuth";
import { normalizeRepo } from "@/lib/hotMerge";

/**
 * skills.sh install data for the weekly Hot scan.
 *
 * WHY THIS ROUTE EXISTS AT ALL — it is a proxy, and proxies deserve suspicion.
 *
 * skills.sh's API (https://skills.sh/docs/api) authenticates with a Vercel OIDC
 * token: team- and project-scoped, rotating roughly every 12 hours, minted by
 * calling getVercelOidcToken() inside a request handler on a Vercel deployment.
 * The weekly scan runs in GitHub Actions, which is not a Vercel deployment and
 * cannot mint one. The token also cannot be parked in a GitHub secret, because
 * it expires twice a day.
 *
 * So the OIDC call has to happen here, on the deployment, and the scan reaches
 * it over a shared secret it CAN hold. Everything else about the scan stays in
 * the Action, next to the submission-review workflows and the GITHUB_TOKEN that
 * opens the pull request.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * No merging, no ranking, no catalog matching. Those are pure functions in
 * src/lib/hotMerge.ts, tested without a network, and running them here would
 * put the logic that decides what the board says behind an HTTP call nobody
 * can exercise locally. This route fetches and normalizes. That is all.
 *
 * It also returns absolute `installs` alongside skills.sh's own daily `change`.
 * Our window is a week and theirs is a day, so the scan computes a real 7-day
 * delta against its own stored snapshot and treats `change` only as the
 * fallback for the first run, when no baseline exists yet.
 */

/** Cap per page: the API allows 500, and one page covers the leaderboard we care about. */
const PER_PAGE = 500;

/** Give up rather than hang a scheduled job on a slow upstream. */
const UPSTREAM_TIMEOUT_MS = 15_000;

interface SkillsShItem {
  id?: string;
  slug?: string;
  name?: string;
  source?: string;
  installs?: number;
  installsYesterday?: number;
  change?: number;
  sourceType?: string;
  installUrl?: string;
  url?: string;
}

export interface HotSourceEntry {
  slug: string;
  repo: string | null;
  /** Absolute install count. The scan diffs this against last week's snapshot. */
  installs: number;
  /** skills.sh's own day-over-day delta, or null when the view does not carry one. */
  change: number | null;
  url?: string;
}

async function fetchView(view: "all-time" | "hot", token: string): Promise<SkillsShItem[]> {
  const url = `https://skills.sh/api/v1/skills?view=${view}&per_page=${PER_PAGE}&page=0`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    // Never serve a cached ranking: a stale week is precisely the defect the
    // whole Hot board rework exists to remove.
    cache: "no-store",
  });

  if (!response.ok) {
    // 429 carries Retry-After; surface it so the Action's log says something
    // actionable instead of "upstream said no".
    const retry = response.headers.get("retry-after");
    throw new Error(
      `skills.sh ${view} responded ${response.status}${retry ? ` (retry-after ${retry})` : ""}`
    );
  }

  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body?.data)) {
    // Shape drift is a real risk on someone else's API. Fail loudly here so the
    // scan drops this source and says so in the PR, rather than proposing a
    // ranking built from nothing.
    throw new Error(`skills.sh ${view} returned no data array`);
  }
  return body.data as SkillsShItem[];
}

/**
 * `source` is "owner/name" on GitHub-sourced skills; `installUrl` is the repo
 * URL. Prefer the URL, fall back to `source`, and accept neither.
 */
function repoOf(item: SkillsShItem): string | null {
  const fromUrl = normalizeRepo(item.installUrl);
  if (fromUrl) return fromUrl;
  const source = item.source?.trim().toLowerCase();
  if (item.sourceType === "github" && source && /^[^/\s]+\/[^/\s]+$/.test(source)) return source;
  return null;
}

function normalize(items: SkillsShItem[]): Map<string, HotSourceEntry> {
  const out = new Map<string, HotSourceEntry>();
  for (const item of items) {
    const slug = (item.slug || item.name || "").trim();
    if (!slug) continue;
    const repo = repoOf(item);
    const key = repo ? `${repo}#${slug.toLowerCase()}` : slug.toLowerCase();
    if (out.has(key)) continue;
    out.set(key, {
      slug,
      repo,
      installs: Number.isFinite(item.installs) ? (item.installs as number) : 0,
      change: Number.isFinite(item.change) ? (item.change as number) : null,
      url: item.url,
    });
  }
  return out;
}

export async function GET(request: Request) {
  if (!isBearerAuthorized(request, process.env.HOT_SCAN_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let token: string;
  try {
    // Must be called per-request, not at module scope: the token rotates and a
    // module-scope value would be baked in at first invocation and then expire.
    token = await getVercelOidcToken();
  } catch (error) {
    return NextResponse.json(
      {
        error: "oidc_unavailable",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }

  try {
    // all-time carries absolute installs for the whole leaderboard; hot carries
    // the day-over-day change. Merge them per skill so the scan gets both
    // without needing to know the API has two views.
    const [allTime, hot] = await Promise.all([
      fetchView("all-time", token),
      fetchView("hot", token),
    ]);

    const entries = normalize(allTime);
    for (const [key, item] of normalize(hot)) {
      const existing = entries.get(key);
      if (existing) {
        existing.change = item.change ?? existing.change;
      } else {
        entries.set(key, item);
      }
    }

    return NextResponse.json(
      { source: "skills.sh", fetchedAt: new Date().toISOString(), entries: [...entries.values()] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "upstream_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
