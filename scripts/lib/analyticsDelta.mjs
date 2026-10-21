/**
 * Delta computation and keyword opportunity analysis for VibeTrends analytics.
 */

// null when either side is unavailable (e.g. Vercel Hobby only serves the
// latest 31 days, so the previous period is a 400). Computing against 0 would
// report any traffic as +100%.
export function calculateDelta(current, previous) {
  if (current == null || previous == null) return null;
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

export function parseOwnerIds(envValue) {
  return new Set(String(envValue || '').split(',').map((id) => id.trim()).filter(Boolean));
}

// owner: the site owner's own accounts (personal, Hermes, seed curator), from
// ANALYTICS_OWNER_USER_IDS. agent: anonymous /api/agentauth accounts.
export function classifyAccount(user, ownerIds) {
  if (ownerIds.has(user.id)) return 'owner';
  if (user.is_anonymous) return 'agent';
  return 'human';
}

export function summarizeAccounts(users, ownerIds, days, now = new Date()) {
  const DAY = 86400000;
  const t = now.getTime();
  const empty = () => ({ total: 0, current: 0, previous: 0, signedIn: 0, active7d: 0, active30d: 0, returned: 0 });
  const out = { human: empty(), agent: empty(), owner: empty() };

  for (const u of users) {
    const c = out[classifyAccount(u, ownerIds)];
    const created = new Date(u.created_at).getTime();
    const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null;
    c.total++;
    if (created >= t - days * DAY) c.current++;
    else if (created >= t - 2 * days * DAY) c.previous++;
    if (lastSignIn == null) continue;
    c.signedIn++;
    if (lastSignIn >= t - 7 * DAY) c.active7d++;
    if (lastSignIn >= t - 30 * DAY) c.active30d++;
    if (lastSignIn > created + DAY) c.returned++;
  }
  return out;
}

// Mirrors trackConnectCopy in src/app/components/ConnectBlock.tsx, which
// records item_type as skill, mcp or cli.
const ITEM_ROUTES = { skill: 'skills', mcp: 'mcp', cli: 'cli' };

export function itemPath(itemType, itemSlug) {
  return `/${ITEM_ROUTES[itemType] || itemType}/${itemSlug}`;
}

const DETAIL_PATH = /^\/(skills|mcp|cli)\/[^/]+$/;

// Copy rate per detail page: copy sessions (analytics_events) over Vercel
// visitors for the same path. A page in only one source still gets a row;
// rate is null when there are no visitors to divide by.
export function copyRateByPath(copyItems = [], pages = []) {
  const rows = new Map();
  const row = (p) => {
    if (!rows.has(p)) rows.set(p, { path: p, visitors: 0, copySessions: 0, rate: null });
    return rows.get(p);
  };

  for (const page of pages) {
    const p = String(page.requestPath || '').replace(/\/+$/, '');
    if (DETAIL_PATH.test(p)) row(p).visitors += Number(page.visitors) || 0;
  }
  for (const it of copyItems) {
    if (!it.item_slug) continue;
    row(itemPath(it.item_type, it.item_slug)).copySessions += Number(it.sessions) || 0;
  }

  for (const r of rows.values()) {
    r.rate = r.visitors ? Math.round((r.copySessions / r.visitors) * 1000) / 10 : null;
  }
  return [...rows.values()].sort((a, b) => b.visitors - a.visitors || b.copySessions - a.copySessions);
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
