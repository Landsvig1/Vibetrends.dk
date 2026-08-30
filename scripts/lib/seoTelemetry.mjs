/**
 * SEO and indexing telemetry for vibetrends.dk.
 *
 * Pure helpers live at the top and are unit-tested; everything that talks to
 * the network or shells out to the gsc-admin skill is at the bottom and fails
 * soft, matching the rest of the analytics pipeline.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const BASE_URL = 'https://vibetrends.dk';

/** Hubs that must always be inspected: if one of these drops out of the index
 *  the detail pages below it lose their main internal link source. */
export const CRITICAL_PATHS = [
  '/',
  '/skills',
  '/vibes',
  '/cli',
  '/mcp',
  '/blog',
  '/forum',
];

export function parseSitemapLocs(xml = '') {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/**
 * URL Inspection costs ~7s per call, so the report samples rather than sweeping
 * all ~177 URLs. Priority: every hub, then the pages actually earning
 * impressions (a deindexed page with traffic is the expensive failure), then
 * the newest detail pages, which are the ones most likely not yet indexed.
 */
export function pickInspectionTargets({
  sitemapUrls = [],
  gscTopPages = [],
  limit = 20,
  baseUrl = BASE_URL,
} = {}) {
  const inSitemap = new Set(sitemapUrls);
  const picked = [];
  const seen = new Set();

  const add = (url, reason) => {
    if (!url || seen.has(url) || picked.length >= limit) return;
    seen.add(url);
    picked.push({ url, reason });
  };

  for (const p of CRITICAL_PATHS) {
    const url = `${baseUrl}${p}`;
    if (inSitemap.size === 0 || inSitemap.has(url)) add(url, 'hub');
  }

  // GSC page rows carry the URL in keys[0].
  const ranked = [...gscTopPages]
    .map((r) => ({
      url: Array.isArray(r.keys) ? r.keys[0] : r.page,
      impressions: Number(r.impressions) || 0,
    }))
    .filter((r) => r.url)
    .sort((a, b) => b.impressions - a.impressions);

  for (const r of ranked) add(r.url, 'earning impressions');

  // sitemapUrls arrive in sitemap order; the generator emits detail pages after
  // hubs, and newest-first within a section.
  for (const url of sitemapUrls) add(url, 'sitemap sample');

  return picked;
}

/** Verdicts that mean "Google has this page". Everything else is a problem or
 *  a pending state worth surfacing. */
const INDEXED_STATES = new Set([
  'Submitted and indexed',
  'Indexed, not submitted in sitemap',
]);

export function classifyInspection(result) {
  const idx = result?.inspectionResult?.indexStatusResult || {};
  const rich = result?.inspectionResult?.richResultsResult;
  const coverageState = idx.coverageState || 'Unknown';
  const googleCanonical = idx.googleCanonical || null;
  const userCanonical = idx.userCanonical || null;

  return {
    verdict: idx.verdict || 'UNKNOWN',
    coverageState,
    indexed: INDEXED_STATES.has(coverageState),
    robotsTxtState: idx.robotsTxtState || null,
    pageFetchState: idx.pageFetchState || null,
    lastCrawlTime: idx.lastCrawlTime || null,
    googleCanonical,
    userCanonical,
    // A mismatch means Google picked a different URL as canonical, so this URL
    // will never rank on its own.
    canonicalMismatch: Boolean(
      googleCanonical && userCanonical && googleCanonical !== userCanonical,
    ),
    inSitemap: Array.isArray(idx.sitemap) && idx.sitemap.length > 0,
    richResultTypes: (rich?.detectedItems || []).map((d) => d.richResultType).filter(Boolean),
    hasStructuredData: Boolean(rich?.detectedItems?.length),
  };
}

export function summarizeIndexing(pages = []) {
  const byCoverage = {};
  for (const p of pages) {
    byCoverage[p.coverageState] = (byCoverage[p.coverageState] || 0) + 1;
  }

  const problems = pages.filter(
    (p) => !p.indexed || p.canonicalMismatch || p.pageFetchState === 'FAILED',
  );

  return {
    inspected: pages.length,
    indexed: pages.filter((p) => p.indexed).length,
    notIndexed: pages.filter((p) => !p.indexed).length,
    canonicalMismatches: pages.filter((p) => p.canonicalMismatch).length,
    withStructuredData: pages.filter((p) => p.hasStructuredData).length,
    byCoverage,
    problems,
  };
}

/**
 * `submitted` is the count GSC last read from the sitemap; comparing it to the
 * live file catches a sitemap that stopped regenerating. The API's `indexed`
 * field is deprecated and always returns 0, so it is deliberately ignored.
 */
export function compareSitemap({ liveUrlCount = 0, gscSitemaps = [] } = {}) {
  const primary = gscSitemaps.find((s) => s.path?.endsWith('/sitemap.xml')) || gscSitemaps[0] || null;
  if (!primary) {
    return { registered: false, liveUrlCount, note: 'Sitemap ikke registreret i GSC' };
  }

  const submitted = Number(primary.contents?.[0]?.submitted ?? 0);
  const drift = liveUrlCount - submitted;

  return {
    registered: true,
    path: primary.path,
    submitted,
    liveUrlCount,
    drift,
    errors: Number(primary.errors ?? 0),
    warnings: Number(primary.warnings ?? 0),
    lastDownloaded: primary.lastDownloaded || null,
    lastSubmitted: primary.lastSubmitted || null,
    // Google re-reads the sitemap on its own schedule, so small drift is normal
    // and only a stale download date is actionable.
    stale: primary.lastDownloaded
      ? Date.now() - Date.parse(primary.lastDownloaded) > 7 * 86400000
      : true,
  };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function gscPaths() {
  const skillDir = path.join(process.env.HOME || '', '.claude/skills/gsc-admin');
  return {
    python: path.join(skillDir, 'venv/bin/python3'),
    script: path.join(skillDir, 'scripts/gsc_api.py'),
  };
}

export function gscAvailable() {
  const { python, script } = gscPaths();
  return fs.existsSync(python) && fs.existsSync(script);
}

async function runGsc(args, timeoutMs = 30000) {
  const { python, script } = gscPaths();
  const { stdout } = await execFileAsync(
    python,
    [script, 'sc-domain:vibetrends.dk', ...args],
    { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

export async function fetchLiveSitemap(baseUrl = BASE_URL) {
  try {
    const res = await fetch(`${baseUrl}/sitemap.xml`);
    if (!res.ok) return { error: `sitemap.xml returnerede ${res.status}`, urls: [] };
    return { urls: parseSitemapLocs(await res.text()) };
  } catch (e) {
    return { error: `sitemap fetch fejlede: ${e.message}`, urls: [] };
  }
}

/** Small worker pool: GSC allows 600 inspections/minute, so the limit here is
 *  politeness and local latency, not quota. */
async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * URL Inspection is known to flap between "unknown" and a real state for the
 * same URL seconds apart, so a single negative reading is not trustworthy.
 * Rather than polling every URL three times (which would triple a already slow
 * step), only readings that come back not-indexed are re-checked.
 */
async function inspectOnce(url) {
  try {
    return classifyInspection(await runGsc(['inspect', url]));
  } catch (e) {
    return { url, error: e.message, coverageState: 'Inspection failed', indexed: false };
  }
}

export async function inspectUrls(targets, { concurrency = 4, recheckNegatives = true } = {}) {
  const first = await mapPool(targets, concurrency, async (t) => ({
    ...t,
    ...(await inspectOnce(t.url)),
  }));

  if (!recheckNegatives) return first;

  const negatives = first.filter((r) => !r.indexed);
  if (negatives.length === 0) return first;

  const rechecked = await mapPool(negatives, concurrency, async (r) => ({
    ...r,
    ...(await inspectOnce(r.url)),
    recheckedAfterNegative: true,
  }));

  const byUrl = new Map(rechecked.map((r) => [r.url, r]));
  return first.map((r) => byUrl.get(r.url) || r);
}

export async function getSeoData({ gscTopPages = [], limit = 20 } = {}) {
  try {
    if (!gscAvailable()) {
      return { error: 'GSC admin skill/venv ikke fundet i ~/.claude/skills/gsc-admin' };
    }

    const [live, sitemapsRes] = await Promise.all([
      fetchLiveSitemap(),
      runGsc(['sitemaps']).catch((e) => ({ error: e.message })),
    ]);

    const gscSitemaps = Array.isArray(sitemapsRes) ? sitemapsRes : [];
    const sitemap = compareSitemap({ liveUrlCount: live.urls.length, gscSitemaps });
    if (live.error) sitemap.liveError = live.error;

    const targets = pickInspectionTargets({
      sitemapUrls: live.urls,
      gscTopPages,
      limit,
    });

    const pages = await inspectUrls(targets);

    return { sitemap, indexing: summarizeIndexing(pages), pages };
  } catch (e) {
    return { error: `SEO telemetry error: ${e.message}` };
  }
}
