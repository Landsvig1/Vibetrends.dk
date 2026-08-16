import { describe, it, expect } from 'vitest';
import { calculateDelta, extractGrowthOpportunities } from '../lib/analyticsDelta.mjs';

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
  });
});
