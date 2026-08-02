# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences carry **equal weight**; neither may be degraded to serve the other.

- **Danish human builders** — vibe-coders, prompt engineers, indie devs and
  AI-curious developers. They arrive looking for something concrete: proof that
  a thing is buildable, a skill they can plug into their agent today, or an
  answer to a problem they're stuck on. They browse in Danish by default,
  unauthenticated, often mid-task.
- **Coding agents** — Claude Code, Cursor, Gemini CLI and similar, consuming the
  catalog programmatically through `/api/mcp` (JSON-RPC 2.0, read-only) and the
  REST routes under `/api`. They need machine-readable structure and stable
  taxonomies, not prose.

**Submitters** are a subset of the first group, not a separate audience: the
same people who browse are the ones expected to contribute.

## Product Purpose

A Danish-language directory and community for people building with AI.
It pulls scattered, useful material — skills, projects, CLI tools, MCP servers,
discussion — out of Twitter threads, Discord servers and unfindable GitHub
READMEs, and puts it in one place that is organized, curated and connectable.

**Success is community traction**: real Danish users submitting, discussing and
returning. A complete but inert catalog is a failure state. Design decisions
should be judged against whether they make someone contribute or come back — not
against catalog size.

## Positioning

Bigger English-language skill directories exist and will always list more. The
bet is on two things scale makes hard:

- **Curation** — every catalog entry was chosen, not scraped.
- **Connectability** — each entry is one step from actually landing in the
  user's agent (via `src/lib/connect.ts` connect recipes), not one more
  bookmarked tab.

Plus a third, structural one: it is **agent-native**. The same catalog a human
browses is queryable by the agent that will consume it.

## Operating Context

- Users are typically mid-task in a terminal or editor, switching to the site to
  find one thing, then switching back. The site is a stop, not a destination
  people sit in.
- The interface is Danish-only. The da/en toggle, the `LanguageProvider`, the
  translations dictionary and the `vibe_lang` cookie were deliberately removed
  (PR #94, Aug 2026); UI strings are hardcoded Danish and server code calls the
  data layer with a literal `'da'`. The database still carries `_da`/`_en` column
  pairs — they were left in place, so re-introducing English is a UI decision,
  not a migration.
- Browsing requires no account. Contributing requires passwordless auth
  (Supabase magic link) and passes honeypot spam protection.
- Agents reach the same content without a session cookie, which is why the MCP
  surface is read-only.

## Capabilities and Constraints

**Public sections:** Skills (`/skills`, with topic hubs at
`/skills/topic/[slug]` and Hot/Trending boards), Vibes (`/vibes` — the project
showcase), CLI (`/cli`), MCP servers (`/mcp`), Agents (`/agents`, deliberately
demoted from primary nav), Forum (`/forum`, threaded with categories, upvotes,
replies), Blog (`/blog`), plus About, Agent Guide, Privacy and Terms.

**Terminology — use these exact names:**

- The showcase section is **Vibes** and lives at `/vibes`. (README still calls it
  "Showcase" at `/showcase`; the route is `/vibes` — the README is stale.)
- **Skills** taxonomy is owned solely by `src/lib/topics.ts`: Full-Stack,
  Marketing, Webshop, Front-End, Back-End, Design, Agent workflows.
- The agent feed taxonomy is owned solely by `src/lib/feedTypes.ts` and splits
  into `CLI` (a tool an agent invokes → `/cli`), `MCP Server` (→ `/mcp`), and
  `Host` (a coding agent that is itself a connection target, e.g. Claude Code or
  Cursor — retained for connect recipes, excluded from every catalog).

Both taxonomy files propagate into forms, Zod enums, the MCP schema, hub cards
and the sitemap. Adding a category anywhere else is a bug.

**Constraints future work must preserve:**

- Every public section is Supabase-backed and community-submittable through an
  authenticated, honeypot-protected form.
- `src/lib/db.ts` is the only module that talks to Supabase. Writes go through
  RLS (`WITH CHECK (auth.uid() = user_id)`).
- All user-visible strings must exist in both `da` and `en`. No Danish-only or
  English-only surface.
- MCP write tools (submit / upvote / reply) are **explicitly undecided**, pending
  the agent-auth decision in `docs/decisions/2026-06-19-agent-auth.md`. Do not
  design UI or copy that promises agent write access.
- `cacheComponents` is enabled — cache behavior must be verified when changing
  hot-path queries (home, forum, skills).
- Solo-maintained. Anything that only works with ongoing manual curation labor
  has to be worth that labor.

## Brand Commitments

- Name is lowercase: **vibetrends.dk**.
- Distinct from Kasper's other brands: it is neither `landsvig.com` (personal,
  deliberately not AI-positioned) nor `aiauto.dk` (the AI service business). Do
  not borrow either brand's positioning or visual identity into it.
- Voice is plain and unhyped. The existing About page is the
  reference for tone: concrete, slightly blunt, no marketing inflation — it
  openly names what the site *isn't* trying to be.

## Evidence on Hand

- **Kasper Landsvig, named solo author** — the project is openly built by one
  person, and his name and story are usable as the credibility anchor.
- **Live catalog content** — real, curated entries across skills, vibes, CLI and
  MCP, plus real forum threads and blog posts.
- **Nothing else is citable.** There are no user counts, no traction numbers, no
  testimonials, no case studies, no press. Future copy must not fabricate or
  imply any. Sell the thing itself, not social proof. If a number appears on a
  surface, it must be a live value from the database, not a claim.

## Product Principles

1. **Traction over inventory.** Judge a change by whether it makes someone
   contribute or return — not by whether it makes the catalog look bigger.
2. **Curated, never scraped.** Every entry is a deliberate choice, and the
   product should feel like it. Volume is not the argument.
3. **One step to landing in the agent.** Connectability is the differentiator;
   any path that ends at "bookmark this" has failed.
4. **Both audiences, undegraded.** Human browsing and machine querying are the
   same catalog seen two ways. Neither surface may be sacrificed for the other.
5. **Danish, singular.** One language, written natively rather than translated.
   Don't reintroduce a language toggle or `t()`-style indirection without an
   explicit decision to reverse PR #94.
6. **No borrowed credibility.** Say what the site is without claiming traction it
   doesn't have.

## Accessibility & Inclusion

No product-specific standard has been established. Users are frequently mid-task and scanning rather than
reading, which makes scanability and keyboard-reachable navigation practical
requirements even where no formal standard is set.
