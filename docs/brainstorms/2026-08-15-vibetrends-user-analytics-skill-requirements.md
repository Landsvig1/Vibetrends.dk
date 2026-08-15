---
date: 2026-08-15
topic: vibetrends-user-analytics-skill
---

# VibeTrends.dk Automated User Analytics Skill Requirements

## Summary

A dedicated `vibetrends-analytics` skill for vibetrends.dk that pulls live telemetry from Vercel Web Analytics, Google Search Console, and Supabase DB into an interactive, self-contained HTML executive dashboard with tabbed navigation and period-over-period delta tracking.

---

## Problem Frame

Vibetrends.dk operates with three disconnected telemetry stores: Vercel Web Analytics (visitor traffic and routing), Google Search Console (organic impressions and CTR rankings), and Supabase (user auth, catalog submissions, upvotes, and agent API tokens). Reviewing site health currently requires manual inspection across multiple browser dashboards and ad-hoc database queries. Without an automated, domain-specific analytics aggregator, emerging search surges (such as the recent Aula integration traffic) and community activation bottlenecks remain invisible until manual review.

---

## Key Decisions

- **Domain-Specific to VibeTrends.dk**: Build directly against vibetrends.dk telemetry and schema rather than maintaining an abstracted multi-tenant layer.
- **Tri-Source Ingestion**: Combine traffic analytics (Vercel), search performance (GSC), and product database state (Supabase) in a single run.
- **Self-Contained Interactive HTML Dashboard**: Generate a standalone, single-file HTML live artifact featuring client-side tab navigation and visual charts with zero external runtime dependencies.
- **Period Delta Computation**: Compute period-over-period comparison (e.g. current 30d vs previous 30d) across visitors, pageviews, search queries, and user registrations.
- **Local Artifact Delivery First**: Focus initial implementation on instant artifact generation in chat, deferring transactional email delivery.

---

## Requirements

### Telemetry Extraction & Ingestion

- R1. Extract visitor traffic, pageviews, top route paths, referrer hostnames, country distributions, and device/OS breakdowns from the Vercel Web Analytics API.
- R2. Extract organic search clicks, search impressions, average position rankings, top search queries, and top landing page URLs from the Google Search Console API.
- R3. Query user registrations, active authentication sessions, catalog inventory counts (skills, vibes, agents), community upvote counts, and agent token usage from Supabase.

### Analytics Computation & Delta Tracking

- R4. Support configurable time windows (defaulting to 30 days, with 7-day and 90-day support).
- R5. Calculate comparative period-over-period percentage changes and absolute deltas for core KPIs (visitors, pageviews, organic clicks, new signups).
- R6. Aggregate and surface high-impression, low-CTR search queries ranking on Google Page 1 or 2 as automated growth opportunities.

### Live Interactive HTML Artifact Generation

- R7. Render an interactive, styled single-file HTML artifact containing a tabbed interface:
  - **Overview**: Executive summary, core KPI metric cards with delta indicators, and top alerts.
  - **Traffic & Demographics**: Route traffic breakdown, referrer channels, country distribution, and device metrics.
  - **Search & SEO**: Google keyword rankings, search clicks, impression trends, and CTR conversion rates.
  - **Users & Agent Activity**: User registration velocity, authentication providers, content submissions, and agent API usage.
  - **Growth Opportunities**: High-priority recommendations for metadata optimization and community activation.
- R8. Embed searchable and sortable data tables for route paths and keyword queries without external network requests.
- R9. Ensure the generated HTML report is self-contained with embedded CSS and vanilla JavaScript for offline and portable viewing.

### Skill Packaging & Invocation

- R10. Package the skill as `vibetrends-analytics` in `Skills Global/vibetrends-analytics/` with canonical symlinks to active agent environments.
- R11. Provide a direct CLI execution script in the project root (`scripts/fetch-user-analytics.mjs` or `scripts/generate-analytics-report.mjs`) callable with standard environment variables.

---

## Key Flows

- F1. On-demand analytics generation
  - **Trigger:** User or agent invokes `/vibetrends-analytics` or asks for a VibeTrends activity report.
  - **Actors:** Agent, Vercel API, GSC API, Supabase Database.
  - **Steps:** The skill runs the data extraction script, computes metrics and deltas, generates the standalone HTML dashboard artifact, and returns a concise executive summary with a clickable link to the live artifact.
  - **Outcome:** The user receives immediate key insights in chat and a full interactive dashboard artifact.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R10, R11.

- F2. Interactive report exploration
  - **Trigger:** User opens the generated HTML artifact in the browser.
  - **Actors:** User, HTML Dashboard.
  - **Steps:** User switches between tabs (Traffic, Search, Users, Growth Opportunities), searches query keywords, and reviews period deltas.
  - **Outcome:** Frictionless visual exploration without logging into third-party dashboards.
  - **Covered by:** R7, R8, R9.

---

## Acceptance Examples

- AE1. Complete tri-source data fetch
  - **Covers:** R1, R2, R3, R4
  - **Given:** Valid environment credentials for Supabase, Vercel CLI, and GSC venv.
  - **When:** The analytics generation runner executes for a 30-day window.
  - **Then:** Data from Vercel, GSC, and Supabase is returned without errors and merged into a consolidated dataset.

- AE2. High-opportunity keyword detection
  - **Covers:** R6, R7
  - **Given:** A keyword in GSC data with >20 impressions and <3% CTR with an average position ≤ 15.
  - **When:** The report generates the Growth Opportunities section.
  - **Then:** The keyword is highlighted with its landing page URL and an explicit recommendation to optimize metadata.

- AE3. Offline, zero-dependency artifact rendering
  - **Covers:** R8, R9
  - **Given:** The generated HTML report file opened locally with no internet connection.
  - **When:** The user clicks across tabs and uses the query search bar.
  - **Then:** Navigation and filtering work instantaneously with zero external script failures or broken layout assets.

---

## Scope Boundaries

### In Scope
- Dedicated extraction for `vibetrends.dk` across Vercel Web Analytics, GSC, and Supabase.
- Standalone interactive HTML report generation with multi-tab layout and period comparison deltas.
- Identification of high-impression CTR opportunities and community activation bottlenecks.
- Skill definition in `Skills Global` and reproducible project script.

### Deferred for Later
- Automated email digest delivery via Resend/Gmail.
- Recurring background scheduling (e.g. weekly automated cron triggering).
- Multi-property aggregation across other domains (`landsvig.com`, `aiauto.dk`, `koalafilm.dk`).

### Outside This Product's Identity
- Modifying production client tracking code or installing third-party invasive trackers.
- Writing analytics logs or telemetry state back to Supabase tables.

---

## Dependencies & Assumptions

- **Vercel Auth**: Depends on active Vercel CLI authentication token in `~/Library/Application Support/com.vercel.cli/auth.json`.
- **GSC API Runner**: Depends on the existing OAuth token and Python environment at `~/.claude/skills/gsc-admin/`.
- **Supabase Pooler**: Uses `DATABASE_URL` via the IPv4 connection pooler (`aws-0-eu-west-1.pooler.supabase.com`) with `ssl: { rejectUnauthorized: false }`.
