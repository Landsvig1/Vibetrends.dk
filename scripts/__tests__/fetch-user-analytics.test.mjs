import { describe, it, expect } from 'vitest';
import { calculateDelta, extractGrowthOpportunities, parseOwnerIds, classifyAccount, summarizeAccounts, itemPath, copyRateByPath } from '../lib/analyticsDelta.mjs';

describe('calculateDelta', () => {
  it('calculates positive growth correctly', () => {
    const delta = calculateDelta(150, 100);
    expect(delta.diff).toBe(50);
    expect(delta.percent).toBe(50);
    expect(delta.direction).toBe('up');
  });

  it('calculates negative decline correctly', () => {
    const delta = calculateDelta(80, 100);
    expect(delta.diff).toBe(-20);
    expect(delta.percent).toBe(-20);
    expect(delta.direction).toBe('down');
  });

  it('handles zero previous baseline gracefully', () => {
    const delta = calculateDelta(25, 0);
    expect(delta.diff).toBe(25);
    expect(delta.percent).toBe(100);
    expect(delta.direction).toBe('up');
  });

  it('handles flat zero baseline', () => {
    const delta = calculateDelta(0, 0);
    expect(delta.diff).toBe(0);
    expect(delta.percent).toBe(0);
    expect(delta.direction).toBe('flat');
  });
});

describe('extractGrowthOpportunities', () => {
  it('identifies high impression low CTR queries on page 1/2', () => {
    const mockQueries = [
      { keys: ['boligsiden-property-data'], impressions: 81, clicks: 0, ctr: 0, position: 4.6 },
      { keys: ['motion whiledrag'], impressions: 55, clicks: 0, ctr: 0, position: 7.6 },
      { keys: ['low impression query'], impressions: 3, clicks: 0, ctr: 0, position: 5.0 },
      { keys: ['high ranking high ctr'], impressions: 46, clicks: 6, ctr: 0.13, position: 3.9 },
      { keys: ['deep page query'], impressions: 100, clicks: 0, ctr: 0, position: 85.0 }
    ];

    const opportunities = extractGrowthOpportunities(mockQueries);
    expect(opportunities.length).toBe(2);
    expect(opportunities[0].term).toBe('boligsiden-property-data');
    expect(opportunities[0].impressions).toBe(81);
    expect(opportunities[0].recommendation).toContain('Top 5');
    expect(opportunities[1].term).toBe('motion whiledrag');
  });
});

describe('fetch-user-analytics error resilience', () => {
  it('returns structured error object on Supabase error without throwing ReferenceError', async () => {
    const { getSupabaseData } = await import('../fetch-user-analytics.mjs');
    const result = await getSupabaseData(30);
    // In test environment without live DATABASE_URL, gracefully returns structured error object
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error).toContain('Supabase error:');
  });

  it('returns structured error object on GSC error without throwing ReferenceError', async () => {
    const { getGscData } = await import('../fetch-user-analytics.mjs');
    const result = getGscData(30);
    if (result.error) {
      expect(result.error).toContain('GSC');
    } else {
      expect(result).toHaveProperty('summary');
    }
    // Touches the network via the gcloud CLI; the 5s default flaked in CI.
  }, 15000);
});

describe('calculateDelta with an unavailable previous period', () => {
  it('returns null when the previous value is null, never 100%', () => {
    expect(calculateDelta(137, null)).toBeNull();
    expect(calculateDelta(137, undefined)).toBeNull();
  });

  it('returns null when the current value is null', () => {
    expect(calculateDelta(null, 40)).toBeNull();
  });

  it('still treats a real zero baseline as a number', () => {
    expect(calculateDelta(5, 0)).not.toBeNull();
  });
});

describe('account classification', () => {
  const ownerIds = parseOwnerIds('owner-1, owner-2');

  it('reads owner ids from a comma separated env value', () => {
    expect([...ownerIds]).toEqual(['owner-1', 'owner-2']);
  });

  it('treats a missing or empty env value as no owners', () => {
    expect(parseOwnerIds(undefined).size).toBe(0);
    expect(parseOwnerIds('').size).toBe(0);
    expect(classifyAccount({ id: 'owner-1', is_anonymous: false }, parseOwnerIds(undefined))).toBe('human');
  });

  it('classifies owners by id before anything else', () => {
    expect(classifyAccount({ id: 'owner-2', is_anonymous: false }, ownerIds)).toBe('owner');
  });

  it('classifies anonymous accounts as agents', () => {
    expect(classifyAccount({ id: 'anon-1', is_anonymous: true }, ownerIds)).toBe('agent');
  });

  it('classifies everything else as human', () => {
    expect(classifyAccount({ id: 'person-1', is_anonymous: false }, ownerIds)).toBe('human');
  });

  it('counts each class separately in every period and activity bucket', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const daysAgo = (d) => new Date(now.getTime() - d * 86400000).toISOString();
    const users = [
      // Human, signed up 10 days ago, back 3 days ago: current, active 7d, returned.
      { id: 'person-1', is_anonymous: false, created_at: daysAgo(10), last_sign_in_at: daysAgo(3) },
      // Human, signed up 45 days ago, only ever signed in on day one.
      { id: 'person-2', is_anonymous: false, created_at: daysAgo(45), last_sign_in_at: daysAgo(45) },
      // Human who never signed in.
      { id: 'person-3', is_anonymous: false, created_at: daysAgo(100), last_sign_in_at: null },
      { id: 'anon-1', is_anonymous: true, created_at: daysAgo(2), last_sign_in_at: daysAgo(2) },
      { id: 'owner-1', is_anonymous: false, created_at: daysAgo(120), last_sign_in_at: daysAgo(1) },
    ];

    const s = summarizeAccounts(users, ownerIds, 30, now);

    expect(s.human).toEqual({
      total: 3, current: 1, previous: 1, signedIn: 2, active7d: 1, active30d: 1, returned: 1,
    });
    expect(s.agent).toMatchObject({ total: 1, current: 1, previous: 0 });
    expect(s.owner).toMatchObject({ total: 1, current: 0, active7d: 1, returned: 1 });
  });
});

describe('copyRateByPath', () => {
  it('maps item types to their detail routes', () => {
    expect(itemPath('cli', 'aula-api-klient')).toBe('/cli/aula-api-klient');
    expect(itemPath('mcp', 'aula-mcp')).toBe('/mcp/aula-mcp');
    expect(itemPath('skill', 'ai-seo')).toBe('/skills/ai-seo');
  });

  it('joins copy sessions with Vercel visitors, keeping slugs present in one source only', () => {
    const copyItems = [
      { item_type: 'cli', item_slug: 'aula-api-klient', sessions: '2' },
      // Copied, but Vercel has no row for the page.
      { item_type: 'mcp', item_slug: 'only-copied', sessions: '1' },
    ];
    const pages = [
      { requestPath: '/cli/aula-api-klient', visitors: 25 },
      // Visited, never copied.
      { requestPath: '/mcp/nemlig-mcp/', visitors: 38 },
      // Not a detail page: excluded.
      { requestPath: '/', visitors: 45 },
      { requestPath: '/mcp', visitors: 10 },
    ];

    const rows = copyRateByPath(copyItems, pages);

    expect(rows).toEqual([
      { path: '/mcp/nemlig-mcp', visitors: 38, copySessions: 0, rate: 0 },
      { path: '/cli/aula-api-klient', visitors: 25, copySessions: 2, rate: 8 },
      { path: '/mcp/only-copied', visitors: 0, copySessions: 1, rate: null },
    ]);
  });
});
