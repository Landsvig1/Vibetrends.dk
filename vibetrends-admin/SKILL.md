---
name: vibetrends-admin
description: Navigation and administration guide for the vibetrends.dk community platform. Use when an agent needs to manage content, users, or system configuration for the Next.js/Supabase stack.
---

# VibeTrends.dk Admin Skill

This skill guides agents in maintaining and evolving the `vibetrends.dk` platform.

## Architecture Overview

- **Frontend**: Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui.
- **Backend**: Supabase (Postgres). Data lives in Supabase tables — **not** in `src/data/db.json` (that file and the old `src/lib/github.ts` Octokit backend were removed in the migration).
- **Theme**: Light "off-white" aesthetic. Colors: `--background (#FAF9F6)`, `--accent-primary (#264021)`.
- **Mascot**: Koala (SVG component in `src/app/components/KoalaIcon.tsx`).

## Data Layer (Supabase)

All dynamic data is read/written through `src/lib/db.ts`, which uses the Supabase clients in:

- `src/lib/supabase-server.ts` — server client (`createSupabaseServerClient()`), the anon read client (`supabasePublic`), and `getAuthUser()` for resolving the session user.
- `src/lib/supabase.ts` — browser client.

### Schema

Tables (bilingual content columns use `_da` / `_en` suffixes):

- **skills** — community resource library. No pricing/booking logic.
- **showcase** — vibe-coded project displays. `showcase_upvotes` join table.
- **forum_threads** / **forum_replies** — threaded discussions. `thread_upvotes` join table.
- **agents** — registry for MCP servers and system prompts. `agent_upvotes` join table.
- **blog_posts** — articles.

Schema and policies live in `supabase/migrations/`. Apply changes with a new timestamped migration (`supabase db push` / Supabase MCP `apply_migration`) — never hand-edit the live DB without a migration.

### Workflow: Updating Data

- **In app code**: use the async helpers in `src/lib/db.ts` (e.g. `createSkill`, `createThread`, `deleteThread`). Mutations go through the authenticated server client so RLS applies.
- **Admin/seed edits**: insert/update rows via a Supabase migration, the Supabase dashboard, SQL, or the Supabase MCP tools. Do **not** recreate `src/data/db.json` — it is no longer a source of truth and writing to it diverges from Supabase.
- The build step `scripts/generate-index.js` regenerates `public/semantic-index.json` from Supabase; no manual step needed.

## Auth & Security

- **Auth**: Supabase sessions (email OTP magic links + Google/GitHub OAuth). Client state in `src/app/components/AuthProvider.tsx`.
- **Server identity**: API routes resolve the user via `getAuthUser()` (validates the session cookie). There is **no** `x-username` header — never trust client-supplied identity.
- **Authorization**: enforced by Postgres **RLS** — public read; authenticated insert with `auth.uid() = user_id`; owner-only update/delete. Delete routes rely on RLS and report whether a row was actually removed.
- **Validation**: all POST/DELETE routes validate input with Zod and check the honeypot (`src/lib/honeypot.ts`).
- Upvotes are toggled via the `*_upvotes` join tables; counts are maintained by `SECURITY DEFINER` triggers.

## UI/UX Standards

- **Buttons**: use the `.btn-primary` or `.btn-secondary` classes.
- **Modals**: must be rendered outside `<header>` (see `Header.tsx`) to avoid the `backdrop-filter` trap.
- **Icons**: favor `KoalaIcon` for brand elements and `lucide-react` for UI actions.
- **Language**: user-facing UI is Danish (with an EN toggle, `vibe_lang` cookie). Code and commits are English.

## SEO

- **Metadata**: dynamic pages MUST implement `generateMetadata` using data from the `src/lib/db.ts` helpers (async).
- **Structured Data**: every content page should inject JSON-LD (WebSite, SoftwareApplication, etc.).

## Common Tasks

- **Adding seed/placeholder content**: insert rows via SQL/migration or the Supabase dashboard. Keep roughly 3 items per category for demo balance.
- **Deploying**: Vercel (push to `main` for production; `npx vercel --yes` for previews).
- **Env Vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `DATABASE_URL`.
