# vibetrends.dk

Danish, bilingual (da/en) marketplace and community for AI builders, prompt
engineers and vibe coders. Browse and submit skills, showcase projects, tool
CLIs, MCP servers and agent setups; discuss in the forum; read the blog — all in
one hub. Live at [vibetrends.dk](https://vibetrends.dk).

> **For AI agents:** this single file is meant to orient you on the whole project.
> Read it, then read [`AGENTS.md`](AGENTS.md) — the app targets **Next.js 16**,
> which has breaking changes from older versions, so consult
> `node_modules/next/dist/docs/` before writing Next-specific code. Past
> architectural decisions live in [`docs/decisions/`](docs/decisions/) and plans
> in [`docs/plans/`](docs/plans/).

## What it is

A content-driven directory + community platform. Every public section is backed
by Supabase and is community-submittable through an authenticated, honeypot-
protected form. The UI switches between Danish (default) and English via a
`vibe_lang` cookie; auth is passwordless (Supabase magic links).

Public sections:

- **Skills** (`/skills`) — library of AI skills/workflows, organized by a topic
  hub (`/skills/topic/[slug]`) with Hot/Trending boards.
- **Showcase** (`/showcase`) — projects built with AI, with the prompts behind them.
- **CLI** (`/cli`) — command-line tools an agent can invoke (the "Tool CLI" feed).
- **MCP servers** (`/mcp`) — directory of Model Context Protocol servers.
- **Agents** (`/agents`) — agent configurations/setups (demoted from primary nav).
- **Forum** (`/forum`) — threaded discussions with categories, upvotes and replies.
- **Blog** (`/blog`) — articles and updates.

It is also **agent-native**: `/api/mcp` is a JSON-RPC 2.0 MCP endpoint exposing
read tools (search skills/showcase/agents, list topics) so agents can query the
directory directly. Write tools (submit/upvote/reply) are deferred pending an
agent-auth decision — see [`docs/decisions/2026-06-19-agent-auth.md`](docs/decisions/2026-06-19-agent-auth.md).

## Architecture & key concepts

Things worth knowing before you change code:

- **Single sources of truth for taxonomies.** Two files own all category lists and
  propagate everywhere (forms, Zod enums, MCP schema, hub cards, sitemap):
  - `src/lib/topics.ts` — the **Skills** taxonomy (Full-Stack, Marketing, Webshop,
    Front-End, Back-End, Design, Agent workflows). vibetrends' own list.
  - `src/lib/feedTypes.ts` — the **agent feed-vs-host** taxonomy. The `agents`
    table's `category` column is split into three feeds: `CLI` (a tool an agent
    invokes → `/cli`), `MCP Server` (→ `/mcp`), and `Host` (a coding agent/CLI that
    is itself a *connection target*, e.g. Claude Code/Cursor — retained but excluded
    from every catalog by `getAgents`, and used to build connect recipes via
    `src/lib/connect.ts`).
- **Data layer:** `src/lib/db.ts` is the only place that talks to Supabase. Rows
  carry bilingual `_da`/`_en` columns; query helpers take a `lang` and map to a
  single localized shape. Writes go through RLS (`WITH CHECK (auth.uid() = user_id)`).
- **Auth:** `src/lib/supabase-server.ts` (`getAuthUser`) on the server; magic-link
  flow in the browser client. The MCP endpoint is read-only precisely because
  agents don't carry the session cookie.
- **Caching:** `cacheComponents` is enabled — verify cache behavior when changing
  hot-path queries (home, forum, skills).

## Tech stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS 4
- **Backend:** Supabase (Postgres + auth via `@supabase/ssr`); `pg` for direct queries
- **UI:** Framer Motion, lucide-react
- **Validation:** Zod (+ `src/lib/honeypot.ts` spam protection on submissions)
- **Testing:** Vitest (unit) + Playwright (E2E), gated by GitHub Actions CI
- **Hosting:** Vercel (+ Vercel Analytics)

## Getting started

```bash
npm install
```

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
DATABASE_URL=postgresql://<connection-string>
```

Apply the schema in `supabase/migrations/` to your Supabase project. Note the
project's migrations are applied directly via `pg` + `DATABASE_URL`, **not**
`supabase db push` (which doesn't work here) — see the migration workflow in
[`AGENTS.md`](AGENTS.md). Then:

```bash
npm run dev    # http://localhost:3000
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Generate the search index (`scripts/generate-index.js`), then build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |

CI (`.github/workflows/ci.yml`) runs lint + typecheck + unit tests on every push/PR.

## Project structure

```
src/
  app/
    page.tsx              # Landing page
    layout.tsx            # Root layout + site metadata (metadataBase, OG defaults)
    skills/               #   + /skills/topic/[slug] hub & landings
    showcase/ cli/ mcp/ agents/ forum/ blog/   # Section pages + [id] detail routes
    privacy/ terms/       # Legal pages
    sitemap.ts robots.ts  # Dynamic sitemap (pulls detail IDs from the DB)
    api/                  # REST routes per section (+ health)
    api/mcp/              # Agent-native JSON-RPC 2.0 MCP endpoint
    components/           # Shared UI components
  lib/
    db.ts                 # Supabase data layer (queries, bilingual mapping)
    topics.ts             # SKILLS taxonomy — single source of truth
    feedTypes.ts          # AGENT feed-vs-host taxonomy — single source of truth
    connect.ts            # Host-aware connect-recipe builder
    supabase.ts / supabase-server.ts   # Browser / server Supabase clients
    translations.ts       # da/en copy
    seo.ts jsonLd.ts      # SEO, structured data; per-entity opengraph-image.tsx routes
    honeypot.ts           # Spam protection for submissions
supabase/migrations/      # Postgres schema (ordered, reversible migrations)
scripts/generate-index.js # Build-time search index generation
tests/                    # Playwright E2E specs
docs/                     # plans/, decisions/, brainstorms/
```

## Deployment

Deployed on [Vercel](https://vercel.com). Set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `DATABASE_URL` in the Vercel project env.
Pushes to `main` deploy to production.

## Roadmap

In-progress and deferred work lives in [`docs/plans/`](docs/plans/) — currently
URL-based locale routing, Postgres full-text search, and the agent-native
write-access implementation (gated on the agent-auth decision).
