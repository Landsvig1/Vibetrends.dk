/**
 * Delta computation and keyword opportunity analysis for VibeTrends analytics.
 */

export function calculateDelta(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const diff = cur - prev;
  const percent = prev > 0 
    ? Math.round(((cur - prev) / prev) * 100)
    : (cur > 0 ? 100 : 0);
  
  return {
    current: cur,
    previous: prev,
    diff,
    percent,
    direction: diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')
  };
}

export function extractGrowthOpportunities(gscQueries = []) {
  return gscQueries
    .filter(q => {
      const impressions = Number(q.impressions) || 0;
      const ctr = Number(q.ctr) || 0;
      const position = Number(q.position) || 99;
      // High-impression, early ranking (Page 1/2), but CTR under 5%
      return impressions >= 15 && position <= 20 && ctr < 0.05;
    })
    .map(q => {
      const term = Array.isArray(q.keys) ? q.keys[0] : (q.query || 'unknown');
      const impressions = Number(q.impressions) || 0;
      const clicks = Number(q.clicks) || 0;
      const ctr = Number(q.ctr) || 0;
      const position = Math.round((Number(q.position) || 0) * 10) / 10;
      
      let recommendation = 'Optimer title og meta description med præcist søgeord';
      if (position <= 5) {
        recommendation = 'Top 5 placering! Tilføj stærkere CTA og FAQ i schema for at løfte CTR';
      } else if (position <= 10) {
        recommendation = 'Side 1 placering. Skærp overskrifter (H1/H2) for at rykke i Top 3';
      }

      return {
        term,
        impressions,
        clicks,
        ctr: Math.round(ctr * 1000) / 10, // e.g. 2.4%
        position,
        recommendation
      };
    })
    .sort((a, b) => b.impressions - a.impressions);
}
