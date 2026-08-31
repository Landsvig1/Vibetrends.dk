import { describe, it, expect } from 'vitest';
import {
  parseSitemapLocs,
  pickInspectionTargets,
  classifyInspection,
  summarizeIndexing,
  compareSitemap,
  CRITICAL_PATHS,
} from '../lib/seoTelemetry.mjs';

const BASE = 'https://vibetrends.dk';

describe('parseSitemapLocs', () => {
  it('extracts every <loc>, tolerating whitespace and lastmod siblings', () => {
    const xml = `<urlset>
      <url><loc>${BASE}/</loc><lastmod>2026-08-01</lastmod></url>
      <url><loc>  ${BASE}/skills  </loc></url>
      <url><loc>${BASE}/vibes</loc></url>
    </urlset>`;
    expect(parseSitemapLocs(xml)).toEqual([`${BASE}/`, `${BASE}/skills`, `${BASE}/vibes`]);
  });

  it('returns [] for empty or malformed input rather than throwing', () => {
    expect(parseSitemapLocs('')).toEqual([]);
    expect(parseSitemapLocs(undefined)).toEqual([]);
  });
});

describe('pickInspectionTargets', () => {
  const sitemapUrls = [...CRITICAL_PATHS.map((p) => `${BASE}${p}`), `${BASE}/skills/a`, `${BASE}/skills/b`];

  it('always includes every hub before sampling detail pages', () => {
    const picked = pickInspectionTargets({ sitemapUrls, limit: 20 });
    for (const p of CRITICAL_PATHS) {
      expect(picked.some((t) => t.url === `${BASE}${p}`)).toBe(true);
    }
  });

  it('prioritises pages earning impressions over arbitrary sitemap entries', () => {
    const picked = pickInspectionTargets({
      sitemapUrls,
      gscTopPages: [
        { keys: [`${BASE}/skills/b`], impressions: 500 },
        { keys: [`${BASE}/skills/a`], impressions: 10 },
      ],
      limit: CRITICAL_PATHS.length + 1,
    });
    // Only one slot past the hubs, so it must go to the higher-impression page.
    const extra = picked.slice(CRITICAL_PATHS.length);
    expect(extra).toHaveLength(1);
    expect(extra[0].url).toBe(`${BASE}/skills/b`);
    expect(extra[0].reason).toBe('earning impressions');
  });

  it('never exceeds the limit and never repeats a URL', () => {
    const picked = pickInspectionTargets({
      sitemapUrls,
      gscTopPages: [{ keys: [`${BASE}/skills`], impressions: 99 }],
      limit: 5,
    });
    expect(picked).toHaveLength(5);
    expect(new Set(picked.map((p) => p.url)).size).toBe(5);
  });
});

describe('classifyInspection', () => {
  const indexed = {
    inspectionResult: {
      indexStatusResult: {
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        robotsTxtState: 'ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        googleCanonical: `${BASE}/skills`,
        userCanonical: `${BASE}/skills`,
        sitemap: [`${BASE}/sitemap.xml`],
      },
    },
  };

  it('marks a submitted-and-indexed page as indexed with no mismatch', () => {
    const c = classifyInspection(indexed);
    expect(c.indexed).toBe(true);
    expect(c.canonicalMismatch).toBe(false);
    expect(c.inSitemap).toBe(true);
  });

  it('flags a canonical mismatch, which silently stops a page ranking', () => {
    const c = classifyInspection({
      inspectionResult: {
        indexStatusResult: {
          coverageState: 'Duplicate, Google chose different canonical than user',
          googleCanonical: `${BASE}/skills/original`,
          userCanonical: `${BASE}/skills/copy`,
        },
      },
    });
    expect(c.canonicalMismatch).toBe(true);
    expect(c.indexed).toBe(false);
  });

  it('treats "Crawled - currently not indexed" as not indexed', () => {
    const c = classifyInspection({
      inspectionResult: {
        indexStatusResult: { coverageState: 'Crawled - currently not indexed' },
      },
    });
    expect(c.indexed).toBe(false);
  });

  it('counts "Indexed, not submitted in sitemap" as indexed', () => {
    const c = classifyInspection({
      inspectionResult: {
        indexStatusResult: { coverageState: 'Indexed, not submitted in sitemap' },
      },
    });
    expect(c.indexed).toBe(true);
  });

  it('reads rich result types when structured data is detected', () => {
    const c = classifyInspection({
      inspectionResult: {
        indexStatusResult: { coverageState: 'Submitted and indexed' },
        richResultsResult: {
          detectedItems: [{ richResultType: 'Breadcrumbs' }, { richResultType: 'Article' }],
        },
      },
    });
    expect(c.hasStructuredData).toBe(true);
    expect(c.richResultTypes).toEqual(['Breadcrumbs', 'Article']);
  });

  it('does not throw on an empty or failed inspection payload', () => {
    const c = classifyInspection({});
    expect(c.indexed).toBe(false);
    expect(c.coverageState).toBe('Unknown');
    expect(c.hasStructuredData).toBe(false);
  });
});

describe('summarizeIndexing', () => {
  it('counts states and collects only the actionable pages as problems', () => {
    const s = summarizeIndexing([
      { coverageState: 'Submitted and indexed', indexed: true, canonicalMismatch: false, hasStructuredData: true },
      { coverageState: 'Crawled - currently not indexed', indexed: false, canonicalMismatch: false, hasStructuredData: false },
      { coverageState: 'Submitted and indexed', indexed: true, canonicalMismatch: true, hasStructuredData: true },
    ]);
    expect(s.inspected).toBe(3);
    expect(s.indexed).toBe(2);
    expect(s.notIndexed).toBe(1);
    expect(s.canonicalMismatches).toBe(1);
    expect(s.withStructuredData).toBe(2);
    expect(s.byCoverage['Submitted and indexed']).toBe(2);
    // The indexed-but-mismatched page is still a problem.
    expect(s.problems).toHaveLength(2);
  });
});

describe('compareSitemap', () => {
  const base = {
    path: `${BASE}/sitemap.xml`,
    lastDownloaded: new Date().toISOString(),
    lastSubmitted: '2026-08-06T06:06:18.209Z',
    errors: '0',
    warnings: '0',
    contents: [{ type: 'web', submitted: '176', indexed: '0' }],
  };

  it('reports drift between the live sitemap and what GSC last read', () => {
    const c = compareSitemap({ liveUrlCount: 177, gscSitemaps: [base] });
    expect(c.registered).toBe(true);
    expect(c.submitted).toBe(176);
    expect(c.liveUrlCount).toBe(177);
    expect(c.drift).toBe(1);
    expect(c.stale).toBe(false);
  });

  it('ignores the deprecated indexed field entirely', () => {
    // GSC always returns indexed:"0" here; surfacing it would read as a total
    // indexing failure when the site is in fact indexed.
    const c = compareSitemap({ liveUrlCount: 177, gscSitemaps: [base] });
    expect(c).not.toHaveProperty('indexed');
  });

  it('marks a sitemap Google has not fetched in over a week as stale', () => {
    const old = { ...base, lastDownloaded: new Date(Date.now() - 30 * 86400000).toISOString() };
    expect(compareSitemap({ liveUrlCount: 177, gscSitemaps: [old] }).stale).toBe(true);
  });

  it('handles the sitemap not being registered at all', () => {
    const c = compareSitemap({ liveUrlCount: 177, gscSitemaps: [] });
    expect(c.registered).toBe(false);
  });
});
