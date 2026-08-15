/**
 * Comprehensive Multi-Source Telemetry Extractor for vibetrends.dk
 * Pulls current and previous period from:
 * 1. Supabase Database (Users, Auth, Submissions, Upvotes, API/Agent Activity)
 * 2. Vercel Web Analytics API (Visitors, Pageviews, Top Pages, Referrers, Geographies, Devices)
 * 3. Google Search Console API (Clicks, Impressions, Queries, Pages)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import pg from 'pg';
import { calculateDelta, extractGrowthOpportunities } from './lib/analyticsDelta.mjs';

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
      },
      signupsByDay: signupsByDay.rows,
      content: contentStats.rows,
      upvotes: upvotesStats.rows,
      apiActivity: rateLimitActivity.rows,
    };
  } catch {
    return { error: `Supabase error: ${e.message}` };
  }
}

export async function getVercelData(days = 30) {
  try {
    const authPath = path.join(
      process.env.HOME || '',
      'Library/Application Support/com.vercel.cli/auth.json'
    );
    if (!fs.existsSync(authPath)) {
      return { error: 'Vercel auth.json not found' };
    }
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const token = auth.token;
    const projectId = 'prj_Y7fpTHFk02cCLVSxnC8XKFODsflz';
    const teamId = 'team_ripjlZeFprqucLRTvMbc07fo';
    
    // Current period
    const curSince = new Date(Date.now() - days * 86400000).toISOString();
    const curUntil = new Date().toISOString();

    // Previous period
    const prevSince = new Date(Date.now() - (days * 2) * 86400000).toISOString();
    const prevUntil = curSince;

    async function query(endpoint, since, until, params = {}) {
      const q = new URLSearchParams({
        projectId,
        teamId,
        since,
        until,
        environment: 'production',
        ...params,
      });
      const res = await fetch(`https://api.vercel.com/v1/query/web-analytics/${endpoint}?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
  } catch {
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
  } catch {
    return { error: `GSC error: ${e.message}` };
  }
}

export async function fetchAllUserAnalytics(days = 30) {
  const [supabase, vercel, gsc] = await Promise.all([
    getSupabaseData(days),
    getVercelData(days),
    Promise.resolve(getGscData(days)),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    supabase,
    vercel,
    gsc,
  };
}

if (process.argv[1] && process.argv[1].endsWith('fetch-user-analytics.mjs')) {
  const days = Number(process.argv[2]) || 30;
  fetchAllUserAnalytics(days)
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(console.error);
}
