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
import { connect } from './lib/db.mjs';
import {
  calculateDelta,
  extractGrowthOpportunities,
  parseOwnerIds,
  classifyAccount,
  summarizeAccounts,
  copyRateByPath,
} from './lib/analyticsDelta.mjs';
import { getSeoData } from './lib/seoTelemetry.mjs';

export async function getSupabaseData(days = 30) {
  try {
    const client = await connect();

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

    // Every user count is split by class: 95% of auth.users are anonymous
    // agent accounts and three are the owner's, so a single total says nothing
    // about real people.
    const ownerIds = parseOwnerIds(process.env.ANALYTICS_OWNER_USER_IDS);
    const accounts = summarizeAccounts(allUsersRes.rows, ownerIds, days);

    const userProfiles = [];

    for (const u of allUsersRes.rows) {
      const userType = classifyAccount(u, ownerIds);

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
      } else if (userType === 'owner') {
        origin = 'VibeTrends Platform (Ejer)';
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

    // Activation funnel. analytics_events is the first-party mirror of the
    // copy/connect events; Vercel's own custom-event API is 402 on this plan.
    let funnel = null;
    try {
      const copyStats = (await q(`
        SELECT count(*) as events,
               count(distinct session_id) as sessions,
               count(distinct item_slug) as items,
               count(*) filter (where user_id is not null) as by_signed_in
        FROM public.analytics_events
        WHERE event_name = 'copy_install'
          AND occurred_at >= NOW() - INTERVAL '${days} days'
      `)).rows[0];

      let prevCopySessions = null;
      try {
        prevCopySessions = (await q(`
          SELECT count(distinct session_id) as sessions
          FROM public.analytics_events
          WHERE event_name = 'copy_install'
            AND occurred_at >= NOW() - INTERVAL '${days * 2} days'
            AND occurred_at < NOW() - INTERVAL '${days} days'
        `)).rows[0].sessions;
      } catch {
        // A failed prior-period query must show as n/a, not as +100%.
      }

      const topItems = (await q(`
        SELECT item_type, item_slug, count(*) as copies,
               count(distinct session_id) as sessions
        FROM public.analytics_events
        WHERE event_name = 'copy_install'
          AND occurred_at >= NOW() - INTERVAL '${days} days'
          AND item_slug IS NOT NULL
        GROUP BY 1, 2
        ORDER BY copies DESC
      `)).rows;

      funnel = {
        copyEvents: Number(copyStats.events),
        copySessions: Number(copyStats.sessions),
        itemsCopied: Number(copyStats.items),
        copiesBySignedIn: Number(copyStats.by_signed_in),
        copySessionsDelta: calculateDelta(copyStats.sessions, prevCopySessions),
        topItems,
      };
    } catch (e) {
      // The table only exists after its migration is applied; a report run
      // against an older database should still produce everything else.
      funnel = { error: `analytics_events utilgængelig: ${e.message}` };
    }

    await client.end();

    const humans = accounts.human;

    return {
      // Headline numbers are humans only; agents and owners ride along in byClass.
      users: {
        ...humans,
        delta: calculateDelta(humans.current, humans.previous),
        byClass: accounts,
      },
      signupsByDay: signupsByDay.rows,
      content: contentStats.rows,
      upvotes: upvotesStats.rows,
      apiActivity: rateLimitActivity.rows,
      userProfiles,
      funnel,
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
      // 100 is the API maximum; at 25 the detail pages the copy-rate join
      // needs were cut off.
      query('visits/aggregate', curSince, curUntil, { by: 'requestPath', limit: '100' }),
      query('visits/aggregate', curSince, curUntil, { by: 'referrerHostname', limit: '15' }),
      query('visits/aggregate', curSince, curUntil, { by: 'country', limit: '15' }),
      query('visits/aggregate', curSince, curUntil, { by: 'deviceType' }),
      query('visits/aggregate', curSince, curUntil, { by: 'osName', limit: '10' }),
    ]);

    // Hobby only serves the latest 31 days, so prevTotals is a 400 (null)
    // and the deltas become null instead of +100% against a fake 0.
    const curVisitors = curTotals?.data?.visitors ?? null;
    const prevVisitors = prevTotals?.data?.visitors ?? null;
    const curPageviews = curTotals?.data?.pageviews ?? null;
    const prevPageviews = prevTotals?.data?.pageviews ?? null;

    return {
      totals: {
        visitors: curVisitors || 0,
        pageviews: curPageviews || 0,
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
        // null, not []: an empty result is real data, a failed call is not.
        return null;
      }
    }

    const curQueriesRes = runGsc('query', curStart, curEnd);
    const prevQueries = runGsc('query', prevStart, prevEnd);
    const curPages = runGsc('page', curStart, curEnd) || [];
    const curDates = runGsc('date', curStart, curEnd) || [];
    const curQueries = curQueriesRes || [];

    const sum = (rows, key) => (rows ? rows.reduce((acc, r) => acc + (r[key] || 0), 0) : null);
    const curClicks = sum(curQueriesRes, 'clicks');
    const prevClicks = sum(prevQueries, 'clicks');
    const curImpressions = sum(curQueriesRes, 'impressions');
    const prevImpressions = sum(prevQueries, 'impressions');

    const opportunities = extractGrowthOpportunities(curQueries);

    return {
      summary: {
        clicks: curClicks || 0,
        impressions: curImpressions || 0,
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

  if (supabase.funnel && !supabase.funnel.error) {
    const visitors = vercel?.totals?.visitors || 0;
    supabase.funnel.siteCopyRate = visitors
      ? Math.round((supabase.funnel.copySessions / visitors) * 1000) / 10
      : null;
    supabase.funnel.copyRateByPath = copyRateByPath(supabase.funnel.topItems, vercel?.topPages || []);
  }

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
