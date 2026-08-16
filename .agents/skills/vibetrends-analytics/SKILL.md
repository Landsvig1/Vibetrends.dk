---
name: vibetrends-analytics
description: >
  Extract, analyze, and generate comprehensive live user activity and telemetry reports
  for vibetrends.dk. Unifies Vercel Web Analytics (traffic, routes, referrers, geo),
  Google Search Console (clicks, impressions, keywords, CTR rankings), and Supabase DB
  (users, signups, upvotes, catalog state, agent API activity) into an interactive HTML
  executive dashboard with WoW/MoM delta comparisons and growth opportunity detection.
  Use whenever the user asks for vibetrends analytics, user activity, traffic reports,
  search performance, or runs `/vibetrends-analytics`.
---

# VibeTrends.dk Analytics & Activity Skill

Automated telemetry aggregator and live HTML artifact generator for `vibetrends.dk`.

## What this skill does

1. **Vercel Web Analytics**: Queries production visitors, pageviews, top route paths, referrers, device/OS stats, and country distributions with period-over-period delta computation (default 30 days vs preceding 30 days).
2. **Google Search Console**: Extracts organic search clicks, search impressions, average position rankings, keyword performance, and detects high-impression/low-CTR opportunities.
3. **Supabase Database**: Extracts total registered users, recent signup velocity, active session rates, catalog inventory (skills, vibes, agents), upvotes, and agent token minting/submission telemetry.
4. **Interactive Live Artifact**: Compiles everything into a self-contained, single-file HTML dashboard with tabbed navigation (Overview, Traffic, Search & SEO, Users & Agents, Growth Opportunities) and searchable tables.

## How to run

From the `projects/vibetrends-dk` workspace root:

```bash
# Standard 30-day reporting window
npm run analytics:report

# Custom window (e.g. 7-day pulse or 90-day review)
npm run analytics:report -- --days=7
npm run analytics:report -- --days=90
```

The runner outputs:
- A terminal executive summary with core KPI deltas.
- An interactive single-file HTML dashboard saved to `output/vibetrends-analytics-YYYY-MM-DD.html`.
- If inside an agent session, writes directly to the active conversation artifact directory as `vibetrends_analytics_dashboard.html`.

## Key Telemetry Sources & Fallbacks

- **Vercel API**: Uses auth token from `~/Library/Application Support/com.vercel.cli/auth.json` against project `prj_Y7fpTHFk02cCLVSxnC8XKFODsflz` (team `team_ripjlZeFprqucLRTvMbc07fo`).
- **Google Search Console**: Headless runner using `~/.claude/skills/gsc-admin/venv/bin/python3` for `sc-domain:vibetrends.dk`.
- **Supabase DB**: Node script using `DATABASE_URL` over IPv4 pooler (`aws-0-eu-west-1.pooler.supabase.com`) with `ssl: { rejectUnauthorized: false }`.
