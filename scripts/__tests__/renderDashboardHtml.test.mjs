import { describe, it, expect } from 'vitest';
import { renderDashboardHtml } from '../lib/renderDashboardHtml.mjs';

describe('renderDashboardHtml', () => {
  it('renders all tab panes including user-types and containers', () => {
    const mockData = {
      windowDays: 30,
      generatedAt: '2026-08-15T22:00:00.000Z',
      vercel: {
        totals: {
          visitors: 120,
          pageviews: 600,
          visitorsDelta: { diff: 20, percent: 20, direction: 'up' },
          pageviewsDelta: { diff: 100, percent: 20, direction: 'up' }
        },
        topPages: [{ requestPath: '/skills', visitors: 30, pageviews: 100 }],
        referrers: [{ referrerHostname: 'google.com', visitors: 20, pageviews: 20 }],
        countries: [{ country: 'DK', visitors: 70 }],
        devices: [{ deviceType: 'desktop', visitors: 80 }],
        os: [{ osName: 'Mac OS', visitors: 75 }]
      },
      gsc: {
        summary: {
          clicks: 12,
          impressions: 350,
          clicksDelta: { diff: 5, percent: 71, direction: 'up' },
          impressionsDelta: { diff: 150, percent: 75, direction: 'up' }
        },
        topQueries: [{ keys: ['aula api'], clicks: 6, impressions: 46, ctr: 0.13, position: 3.9 }],
        growthOpportunities: [{ term: 'motion whiledrag', impressions: 55, clicks: 0, ctr: 0, position: 7.6, recommendation: 'Test rec' }]
      },
      supabase: {
        users: { 
          total: 26, 
          current: 7, 
          signedIn: 23, 
          delta: { diff: 3, percent: 75, direction: 'up' },
          typesSummary: { humans: 4, agents: 21, curatorBots: 1 }
        },
        signupsByDay: [{ day: '2026-08-14T00:00:00.000Z', count: 4 }],
        content: [{ type: 'skills', total: 99, user_authored: 49 }],
        upvotes: [{ type: 'skills', upvotes: 1 }],
        apiActivity: [{ action: 'agentauth', total_events: 7 }],
        userProfiles: [
          {
            id: 'u-1',
            userType: 'human',
            displayName: 'Kasper Landsvig',
            origin: 'Danmark (.com)',
            created_at: '2026-06-19T22:11:55.915Z',
            skillsCount: 0,
            skillsPending: 0,
            vibesCount: 0,
            agentsCount: 0,
            upvotesCount: 1,
            apiEventsCount: 0
          },
          {
            id: 'u-2',
            userType: 'agent',
            displayName: 'agent_a3ca1b76',
            origin: 'Headless API Client (CLI/Agent)',
            created_at: '2026-08-13T18:56:21.028Z',
            skillsCount: 1,
            skillsPending: 1,
            vibesCount: 0,
            agentsCount: 0,
            upvotesCount: 0,
            apiEventsCount: 2
          }
        ]
      }
    };

    const html = renderDashboardHtml(mockData);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('tab-overview');
    expect(html).toContain('tab-user-types');
    expect(html).toContain('tab-traffic');
    expect(html).toContain('tab-search');
    expect(html).toContain('tab-users');
    expect(html).toContain('tab-opportunities');
    expect(html).toContain('agent_a3ca1b76');
    expect(html).toContain('Kasper Landsvig');
    expect(html).toContain('aula api');
    expect(html).toContain('motion whiledrag');
    expect(html).toContain('/skills');
    expect(html).toContain('+20%');
  });

  it('handles empty data payload safely without errors', () => {
    const html = renderDashboardHtml({});
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('VibeTrends.dk');
    expect(html).toContain('tab-overview');
    expect(html).toContain('tab-user-types');
  });

  it('renders the indexing tab with sitemap drift and problem pages', () => {
    const html = renderDashboardHtml({
      windowDays: 30,
      seo: {
        sitemap: {
          registered: true,
          path: 'https://vibetrends.dk/sitemap.xml',
          submitted: 176,
          liveUrlCount: 177,
          drift: 1,
          errors: 0,
          warnings: 0,
          lastDownloaded: '2026-08-29T07:02:17.905Z',
          stale: false,
        },
        indexing: {
          inspected: 12, indexed: 11, notIndexed: 1,
          canonicalMismatches: 0, withStructuredData: 6,
          byCoverage: { 'Submitted and indexed': 11 },
          problems: [{
            url: 'https://vibetrends.dk/mcp/a_1783085673265',
            coverageState: 'Page with redirect',
            reason: 'earning impressions',
            canonicalMismatch: false,
          }],
        },
        pages: [{
          url: 'https://vibetrends.dk/skills',
          coverageState: 'Submitted and indexed',
          indexed: true,
          richResultTypes: ['Breadcrumbs'],
          lastCrawlTime: '2026-08-28T03:26:27Z',
        }],
      },
    });

    expect(html).toContain('tab-indexing');
    expect(html).toContain('/mcp/a_1783085673265');
    expect(html).toContain('Page with redirect');
    expect(html).toContain('Breadcrumbs');
    // Sitemap drift must be visible, not silently swallowed.
    expect(html).toContain('afvigelse');
  });

  it('renders the indexing tab as unavailable instead of throwing when seo errored', () => {
    const html = renderDashboardHtml({ windowDays: 30, seo: { error: 'GSC admin skill mangler' } });
    expect(html).toContain('tab-indexing');
    expect(html).toContain('GSC admin skill mangler');
  });

  it('renders without a seo key at all (--no-seo run)', () => {
    const html = renderDashboardHtml({ windowDays: 30 });
    expect(html).toContain('tab-indexing');
    expect(html).toContain('--no-seo');
  });

  it('renders the activation funnel with copy counts and top items', () => {
    const html = renderDashboardHtml({
      windowDays: 30,
      vercel: { totals: { visitors: 200 } },
      supabase: {
        users: { current: 15 },
        funnel: {
          copyEvents: 40, copySessions: 20, itemsCopied: 8, copiesBySignedIn: 3,
          copySessionsDelta: { diff: 5, percent: 33, direction: 'up' },
          topItems: [{ item_type: 'skill', item_slug: 'jobnet-search', copies: 12, sessions: 9 }],
        },
      },
    });
    expect(html).toContain('Aktiveringsfunnel');
    expect(html).toContain('jobnet-search');
    // 20 of 200 visitors = 10%
    expect(html).toContain('10% af besøgende');
  });

  it('explains the empty funnel instead of rendering a bare zero table', () => {
    const html = renderDashboardHtml({
      windowDays: 30,
      supabase: { funnel: { copyEvents: 0, copySessions: 0, itemsCopied: 0, copiesBySignedIn: 0, copySessionsDelta: {}, topItems: [] } },
    });
    expect(html).toContain('Ingen kopieringshændelser registreret endnu');
  });

  it('surfaces a funnel error without breaking the dashboard', () => {
    const html = renderDashboardHtml({
      windowDays: 30,
      supabase: { funnel: { error: 'analytics_events utilgængelig' } },
    });
    expect(html).toContain('analytics_events utilgængelig');
    expect(html).toContain('<!DOCTYPE html>');
  });
});
