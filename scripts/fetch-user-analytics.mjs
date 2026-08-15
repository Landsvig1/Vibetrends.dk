/**
 * Comprehensive User Analytics Fetcher for vibetrends.dk
 * Pulls from:
 * 1. Supabase Database (Users, Auth, Submissions, Upvotes, API/Agent Activity)
 * 2. Vercel Web Analytics API (Visitors, Pageviews, Top Pages, Referrers, Geographies, Devices)
 * 3. Google Search Console API (Clicks, Impressions, Queries, Pages)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import pg from 'pg';

const { Client } = pg;

async function getSupabaseData() {
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
      count(*) filter (where created_at >= NOW() - INTERVAL '30 days') as users_last_30d,
      count(*) filter (where created_at >= NOW() - INTERVAL '7 days') as users_last_7d,
      count(*) filter (where last_sign_in_at is not null) as users_signed_in
    FROM auth.users
  `);

  const signupsByDay = await client.query(`
    SELECT 
      date_trunc('day', created_at)::date as day,
      count(*) as count
    FROM auth.users
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 14
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

  return {
    users: userStats.rows[0],
    signupsByDay: signupsByDay.rows,
    content: contentStats.rows,
    upvotes: upvotesStats.rows,
    apiActivity: rateLimitActivity.rows,
  };
}

async function getVercelData(days = 30) {
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
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const until = new Date().toISOString();

    async function query(endpoint, params = {}) {
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

    const [totals, topPages, referrers, countries, devices, os] = await Promise.all([
      query('visits/count'),
      query('visits/aggregate', { by: 'requestPath', limit: '20' }),
      query('visits/aggregate', { by: 'referrerHostname', limit: '10' }),
      query('visits/aggregate', { by: 'country', limit: '10' }),
      query('visits/aggregate', { by: 'deviceType' }),
      query('visits/aggregate', { by: 'osName', limit: '10' }),
    ]);

    return {
      totals: totals?.data || {},
      topPages: topPages?.data || [],
      referrers: referrers?.data || [],
      countries: countries?.data || [],
      devices: devices?.data || [],
      os: os?.data || [],
    };
  } catch (e) {
    return { error: e.message };
  }
}

function getGscData() {
  try {
    const gscPath = path.join(process.env.HOME || '', '.claude/skills/gsc-admin');
    const pythonBin = path.join(gscPath, 'venv/bin/python3');
    const script = path.join(gscPath, 'scripts/gsc_api.py');

    if (!fs.existsSync(pythonBin) || !fs.existsSync(script)) {
      return { error: 'GSC admin skill/venv not found' };
    }

    const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    const queryJson = execSync(
      `"${pythonBin}" "${script}" sc-domain:vibetrends.dk analytics ${startDate} ${endDate} query`,
      { encoding: 'utf8' }
    );
    const pageJson = execSync(
      `"${pythonBin}" "${script}" sc-domain:vibetrends.dk analytics ${startDate} ${endDate} page`,
      { encoding: 'utf8' }
    );

    const queries = JSON.parse(queryJson).rows || [];
    const pages = JSON.parse(pageJson).rows || [];

    const totalClicks = queries.reduce((sum, r) => sum + (r.clicks || 0), 0);
    const totalImpressions = queries.reduce((sum, r) => sum + (r.impressions || 0), 0);

    return {
      summary: { totalClicks, totalImpressions },
      topQueries: queries.slice(0, 20),
      topPages: pages.slice(0, 15),
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  const [supabase, vercel, gsc] = await Promise.all([
    getSupabaseData(),
    getVercelData(30),
    Promise.resolve(getGscData()),
  ]);

  const output = {
    generatedAt: new Date().toISOString(),
    supabase,
    vercel,
    gsc,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(console.error);
