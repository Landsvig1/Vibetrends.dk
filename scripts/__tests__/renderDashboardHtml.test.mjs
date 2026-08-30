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
});
