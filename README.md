# vibetrends.dk

Danish marketplace and community for AI builders, prompt engineers and vibe coders. Browse projects, find skills and services, and configure agents — all in one bilingual (Danish/English) hub.

Live at [vibetrends.dk](https://vibetrends.dk).

## Overview

vibetrends.dk is a content-driven directory and community platform with six public sections, all backed by Supabase and community-submitted:

- **Skills** — library of AI skills, workflows and scripts
- **Showcase** — projects built with AI, with the prompts behind them
- **Agents** — agent configurations and setups
- **MCP servers** — directory of Model Context Protocol servers
- **Forum** — threaded discussions with upvotes and replies
- **Blog** — articles and updates

The UI is bilingual: content and copy switch between Danish (default) and English via a `vibe_lang` cookie. Authentication is passwordless (Supabase magic links).

It is also **agent-native**: `/api/mcp` exposes the directory over a JSON-RPC 2.0 MCP endpoint so agents can search skills, showcase projects and agents directly. The read tools are live; write tools (submit/upvote/reply) are deferred pending an agent-auth decision (see `docs/decisions/2026-06-19-agent-auth.md`).

## Tech stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Backend:** Supabase (Postgres + auth via `@supabase/ssr`), with `pg` for direct queries
- **UI:** Framer Motion, lucide-react
- **Validation:** Zod
- **Testing:** Vitest (unit) + Playwright (E2E)
- **Hosting & analytics:** Vercel + Vercel Analytics

> **Note for contributors and agents:** this targets Next.js 16, which has breaking changes from earlier versions. See `AGENTS.md` and read the relevant guide in `node_modules/next/dist/docs/` before writing code.

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project (Postgres + auth)

### 1. Install

```bash
npm install
```

### 2. Configure environment

Create `.env.local` with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
DATABASE_URL=postgresql://<connection-string>
```

### 3. Apply the database schema

Run the migrations in `supabase/migrations/` against your Supabase project (e.g. via the [Supabase CLI](https://supabase.com/docs/guides/local-development) or the SQL editor).

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Generate the search index (`scripts/generate-index.js`), then build for production |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |

## Project structure

```
src/
  app/
    page.tsx              # Landing page
    layout.tsx            # Root layout + site metadata
    skills/ showcase/ agents/ mcp/ forum/ blog/   # Section pages + [id] detail routes
    privacy/ terms/       # Legal pages
    api/                  # REST routes per section (+ health, mcp-servers)
    api/mcp/              # Agent-native JSON-RPC 2.0 MCP endpoint
    components/           # Shared UI components
  lib/
    db.ts                 # Supabase data layer (queries, bilingual mapping)
    supabase.ts           # Browser Supabase client
    supabase-server.ts    # Server / SSR Supabase clients
    translations.ts       # da/en copy
    seo.ts jsonLd.ts ogImage.tsx   # SEO, structured data, OG images
    honeypot.ts           # Spam protection for submissions
supabase/migrations/      # Postgres schema
scripts/generate-index.js # Build-time search index generation
tests/                    # Playwright E2E specs
docs/                     # Plans, decisions, specs
```

## Deployment

Deployed on [Vercel](https://vercel.com). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `DATABASE_URL` in the Vercel project's environment variables. Pushes to `main` deploy to production.

## Roadmap

Planned and in-progress work lives in [`docs/plans/`](docs/plans/), including SEO depth, performance, and the agent-native write-access decision.
