/**
 * Comprehensive Multi-Source Telemetry Extractor for vibetrends.dk
 * Pulls current and previous period from:
 * 1. Supabase Database (Users, User Types, Content Added, Upvotes, API/Agent Activity)
 * 2. Vercel Web Analytics API (Visitors, Pageviews, Top Pages, Referrers, Geographies, Devices)
 * 3. Google Search Console API (Clicks, Impressions, Queries, Pages)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import pg from 'pg';
import { calculateDelta, extractGrowthOpportunities } from './lib/analyticsDelta.mjs';
import { getSeoData } from './lib/seoTelemetry.mjs';

const { Client } = pg;

export async function getSupabaseData(days = 30) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    const projectRef = url.hostname.split('.')[1];
    const client = new Client({
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${projectRef}`,
      password: url.password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();

    const userStats = await client.query(`
      SELECT 
        count(*) as total_users,
        count(*) filter (where created_at >= NOW() - INTERVAL '${days} days') as users_current_period,
        count(*) filter (where created_at >= NOW() - INTERVAL '${days * 2} days' and created_at < NOW() - INTERVAL '${days} days') as users_previous_period,
        count(*) filter (where last_sign_in_at is not null) as users_signed_in
      FROM auth.users
    `);

    const signupsByDay = await client.query(`
      SELECT 
        date_trunc('day', created_at)::date as day,
        count(*) as count
      FROM auth.users
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY 1
      ORDER BY 1 DESC
    `);

    const contentStats = await client.query(`
      SELECT 'skills' as type, count(*) as total, count(*) filter (where user_id is not null) as user_authored FROM skills
      UNION ALL
      SELECT 'vibes' as type, count(*) as total, count(*) filter (where user_id is not null) as user_authored FROM vibes
      UNION ALL
      SELECT 'agents' as type, count(*) as total, count(*) filter (where user_id is not null) as user_authored FROM agents
      UNION ALL
      SELECT 'forum_threads' as type, count(*) as total, count(*) as user_authored FROM forum_threads
      UNION ALL
      SELECT 'blog_posts' as type, count(*) as total, count(*) as user_authored FROM blog_posts
    `);

    const upvotesStats = await client.query(`
      SELECT 'skills' as type, count(*) as upvotes FROM skill_upvotes
      UNION ALL
      SELECT 'vibes' as type, count(*) as upvotes FROM vibes_upvotes
      UNION ALL
      SELECT 'agents' as type, count(*) as upvotes FROM agent_upvotes
      UNION ALL
      SELECT 'forum_threads' as type, count(*) as upvotes FROM thread_upvotes
      UNION ALL
      SELECT 'forum_replies' as type, count(*) as upvotes FROM reply_upvotes
    `);

    const rateLimitActivity = await client.query(`
      SELECT 
        split_part(key, ':', 1) as action,
        count(*) as total_records,
        sum(count) as total_events,
        max(window_start) as latest_activity
      FROM rate_limits
      GROUP BY 1
    `);

    // Detailed user profiles. Six aggregate queries, not five per user: the
    // previous per-user loop issued five round-trips each and was already slow
    // enough at 26 users to need a raised test timeout.
    //
    // Sequential, not Promise.all: a single pg Client serializes concurrent
    // queries anyway and warns that doing so is removed in pg@9.
    const q = (sql) => client.query(sql);

    const allUsersRes = await q(`
      SELECT id, email, created_at, last_sign_in_at, is_anonymous,
             raw_app_meta_data->>'provider' as provider, raw_user_meta_data
      FROM auth.users
      ORDER BY created_at DESC
    `);
    const skillsByUser = await q(`
      SELECT user_id, count(*) as total,
             count(*) filter (where review_state = 'pending') as pending,
             array_agg(title_en || ' (' || review_state || ')') as samples
      FROM skills WHERE user_id IS NOT NULL GROUP BY user_id
    `);
    const vibesByUser = await q(`
      SELECT user_id, count(*) as total,
             array_agg(coalesce(title_en, title_da, slug)) as samples
      FROM vibes WHERE user_id IS NOT NULL GROUP BY user_id
    `);
    const agentsByUser = await q(`
      SELECT user_id, count(*) as total,
             array_agg(coalesce(name, slug)) as samples
      FROM agents WHERE user_id IS NOT NULL GROUP BY user_id
    `);
    const upvotesByUser = await q(`
      SELECT user_id, count(*) as total FROM (
        SELECT user_id FROM skill_upvotes
        UNION ALL SELECT user_id FROM vibes_upvotes
        UNION ALL SELECT user_id FROM agent_upvotes
      ) u WHERE user_id IS NOT NULL GROUP BY user_id
    `);
    // rate_limits keys embed the user id; extract it rather than running a
    // LIKE '%<id>%' scan per user.
    const apiByUser = await q(`
      SELECT substring(key from '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') as user_id,
             sum(count) as total
      FROM rate_limits
      WHERE key ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      GROUP BY 1
    `);

    const byUser = (rows) => new Map(rows.map((r) => [r.user_id, r]));
    const skillsMap = byUser(skillsByUser.rows);
    const vibesMap = byUser(vibesByUser.rows);
    const agentsMap = byUser(agentsByUser.rows);
    const upvotesMap = byUser(upvotesByUser.rows);
    const apiMap = byUser(apiByUser.rows);

    const userProfiles = [];
    let humanCount = 0;
    let agentCount = 0;
    let curatorCount = 0;

    for (const u of allUsersRes.rows) {
      let userType = 'human';
      if (u.is_anonymous || (!u.email && u.raw_user_meta_data?.full_name?.startsWith('agent_'))) {
        userType = 'agent';
        agentCount++;
      } else if (u.email === 'vibes-bot@vibetrends.dk') {
        userType = 'curator_bot';
        curatorCount++;
      } else {
        humanCount++;
      }

      const skills = skillsMap.get(u.id);
      const vibes = vibesMap.get(u.id);
      const agents = agentsMap.get(u.id);

      // Origin / domain parsing
      let origin = 'Ukendt';
      if (userType === 'human' && u.email) {
        const domain = u.email.split('@')[1] || '';
        origin = domain.endsWith('.dk') ? `Danmark (.${domain})` : domain.endsWith('.com') ? `International (${domain})` : domain;
      } else if (userType === 'agent') {
        origin = 'Headless API Client (CLI/Agent)';
      } else if (userType === 'curator_bot') {
        origin = 'VibeTrends Platform (Intern)';
      }

      userProfiles.push({
        id: u.id,
        userType,
        displayName: u.raw_user_meta_data?.full_name || u.raw_user_meta_data?.name || (u.email ? u.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'Anonym'),
        emailMasked: u.email ? u.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : null,
        provider: u.provider || (userType === 'agent' ? 'Agent Auth' : 'email'),
        origin,
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
        skillsCount: Number(skills?.total || 0),
        skillsPending: Number(skills?.pending || 0),
        vibesCount: Number(vibes?.total || 0),
        agentsCount: Number(agents?.total || 0),
        upvotesCount: Number(upvotesMap.get(u.id)?.total || 0),
        apiEventsCount: Number(apiMap.get(u.id)?.total || 0),
        contentSamples: [
          ...(skills?.samples || []).map((s) => `Skill: ${s}`),
          ...(vibes?.samples || []).map((v) => `Vibe: ${v}`),
          ...(agents?.samples || []).map((a) => `Agent: ${a}`),
        ],
      });
    }

    await client.end();

    const u = userStats.rows[0];
    const userDelta = calculateDelta(u.users_current_period, u.users_previous_period);

    return {
      users: {
        total: Number(u.total_users),
        current: Number(u.users_current_period),
        previous: Number(u.users_previous_period),
        signedIn: Number(u.users_signed_in),
        delta: userDelta,
        typesSummary: {
          humans: humanCount,
          agents: agentCount,
          curatorBots: curatorCount,
        }
      },
      signupsByDay: signupsByDay.rows,
      content: contentStats.rows,
      upvotes: upvotesStats.rows,
      apiActivity: rateLimitActivity.rows,
      userProfiles,
    };
  } catch (e) {
    return { error: `Supabase error: ${e.message}` };
  }
}

function getVercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const authPath = path.join(
    process.env.HOME || '',
    'Library/Application Support/com.vercel.cli/auth.json'
  );
  if (!fs.existsSync(authPath)) return null;
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    return auth.token || null;
  } catch {
    return null;
  }
}

export async function getVercelData(days = 30) {
  try {
    let token = getVercelToken();
    const projectId = 'prj_Y7fpTHFk02cCLVSxnC8XKFODsflz';
    const teamId = 'team_ripjlZeFprqucLRTvMbc07fo';
    
    // Current period
    const curSince = new Date(Date.now() - days * 86400000).toISOString();
    const curUntil = new Date().toISOString();

    // Previous period
    const prevSince = new Date(Date.now() - (days * 2) * 86400000).toISOString();
    const prevUntil = curSince;

    async function query(endpoint, since, until, params = {}, retry = true) {
      if (!token) return null;
      const q = new URLSearchParams({
        projectId,
        teamId,
        since,
        until,
        environment: 'production',
        ...params,
      });
      let res = await fetch(`https://api.vercel.com/v1/query/web-analytics/${endpoint}?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if ((res.status === 401 || res.status === 403) && retry) {
        try {
          execSync('npx --yes vercel whoami', { stdio: 'ignore' });
          token = getVercelToken();
          if (token) {
            res = await fetch(`https://api.vercel.com/v1/query/web-analytics/${endpoint}?${q}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        } catch {
          // Ignore refresh failure
        }
      }

      if (!res.ok) return null;
      return await res.json();
    }

    const [curTotals, prevTotals, topPages, referrers, countries, devices, os] = await Promise.all([
      query('visits/count', curSince, curUntil),
      query('visits/count', prevSince, prevUntil),
      query('visits/aggregate', curSince, curUntil, { by: 'requestPath', limit: '25' }),
      query('visits/aggregate', curSince, curUntil, { by: 'referrerHostname', limit: '15' }),
      query('visits/aggregate', curSince, curUntil, { by: 'country', limit: '15' }),
      query('visits/aggregate', curSince, curUntil, { by: 'deviceType' }),
      query('visits/aggregate', curSince, curUntil, { by: 'osName', limit: '10' }),
    ]);

    const curVisitors = curTotals?.data?.visitors || 0;
    const prevVisitors = prevTotals?.data?.visitors || 0;
    const curPageviews = curTotals?.data?.pageviews || 0;
    const prevPageviews = prevTotals?.data?.pageviews || 0;

    return {
      totals: {
        visitors: curVisitors,
        pageviews: curPageviews,
        visitorsDelta: calculateDelta(curVisitors, prevVisitors),
        pageviewsDelta: calculateDelta(curPageviews, prevPageviews),
      },
      topPages: topPages?.data || [],
      referrers: referrers?.data || [],
      countries: countries?.data || [],
      devices: devices?.data || [],
      os: os?.data || [],
    };
  } catch (e) {
    return { error: `Vercel Analytics error: ${e.message}` };
  }
}

export function getGscData(days = 30) {
  try {
    const gscPath = path.join(process.env.HOME || '', '.claude/skills/gsc-admin');
    const pythonBin = path.join(gscPath, 'venv/bin/python3');
    const script = path.join(gscPath, 'scripts/gsc_api.py');

    if (!fs.existsSync(pythonBin) || !fs.existsSync(script)) {
      return { error: 'GSC admin skill/venv not found at ~/.claude/skills/gsc-admin' };
    }

    // Dates for current period
    const curStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const curEnd = new Date().toISOString().slice(0, 10);

    // Dates for previous period
    const prevStart = new Date(Date.now() - (days * 2) * 86400000).toISOString().slice(0, 10);
    const prevEnd = curStart;

    function runGsc(operation, start, end) {
      try {
        const out = execSync(
          `"${pythonBin}" "${script}" sc-domain:vibetrends.dk analytics ${start} ${end} ${operation}`,
          { encoding: 'utf8' }
        );
        return JSON.parse(out).rows || [];
      } catch {
        return [];
      }
    }

    const curQueries = runGsc('query', curStart, curEnd);
    const prevQueries = runGsc('query', prevStart, prevEnd);
    const curPages = runGsc('page', curStart, curEnd);
    const curDates = runGsc('date', curStart, curEnd);

    const curClicks = curQueries.reduce((sum, r) => sum + (r.clicks || 0), 0);
    const prevClicks = prevQueries.reduce((sum, r) => sum + (r.clicks || 0), 0);
    const curImpressions = curQueries.reduce((sum, r) => sum + (r.impressions || 0), 0);
    const prevImpressions = prevQueries.reduce((sum, r) => sum + (r.impressions || 0), 0);

    const opportunities = extractGrowthOpportunities(curQueries);

    return {
      summary: {
        clicks: curClicks,
        impressions: curImpressions,
        clicksDelta: calculateDelta(curClicks, prevClicks),
        impressionsDelta: calculateDelta(curImpressions, prevImpressions),
      },
      topQueries: curQueries.slice(0, 30),
      topPages: curPages.slice(0, 20),
      dailyTrends: curDates,
      growthOpportunities: opportunities,
    };
  } catch (e) {
    return { error: `GSC error: ${e.message}` };
  }
}

export async function fetchAllUserAnalytics(days = 30, { seo = true, seoLimit = 20 } = {}) {
  const [supabase, vercel, gsc] = await Promise.all([
    getSupabaseData(days),
    getVercelData(days),
    Promise.resolve(getGscData(days)),
  ]);

  // Runs after GSC because it prioritises inspecting the pages that are
  // actually earning impressions. Each inspection costs ~2s, so the caller can
  // skip this step for a fast report.
  const seoData = seo
    ? await getSeoData({ gscTopPages: gsc?.topPages || [], limit: seoLimit })
    : null;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    supabase,
    vercel,
    gsc,
    ...(seoData ? { seo: seoData } : {}),
  };
}

if (process.argv[1] && process.argv[1].endsWith('fetch-user-analytics.mjs')) {
  const days = Number(process.argv[2]) || 30;
  const seo = !process.argv.includes('--no-seo');
  fetchAllUserAnalytics(days, { seo })
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(console.error);
}
