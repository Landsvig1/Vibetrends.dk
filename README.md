# vibetrends.dk

Dansk samlingssted og katalog for AI-byggere og prompt engineers. Udforsk og indsend skills, vis projekter frem ("Vibes"), find CLI-værktøjer og MCP-servere, diskuter i forummet og læs guides på bloggen. Alt samlet ét sted og tilgængeligt for både mennesker og agenter. Live på [vibetrends.dk](https://vibetrends.dk).

> **Til AI-agenter:** Denne fil giver et hurtigt overblik over projektet. Læs derefter [`AGENTS.md`](AGENTS.md). Applikationen kører **Next.js 16**, som har breaking changes i forhold til ældre versioner. Arkitektoniske beslutninger ligger under [`docs/decisions/`](docs/decisions/) og planer under [`docs/plans/`](docs/plans/).

## Hvad det er

Et indholdsdrevet katalog og fællesskab for AI-udvikling. Alle offentlige sektioner drives af Supabase og tager imod bidrag fra fællesskabet via godkendelses- og review-flows. Sitet er på dansk, med engelsk fallback for internationale ressourcer i databasen.

Offentlige sektioner:

- **Skills** (`/skills`): Katalog over AI-workflows, kildekode-scripts og prompts, opdelt efter emne-kategorier (`/skills/topic/[slug]`).
- **Vibes** (`/vibes`): Showcase af projekter bygget med AI, inklusiv prompts og værktøjer bag.
- **CLI** (`/cli`): Værktøjer og kommandoer en agent kan eksekvere (Tool CLI-feed).
- **MCP-servere** (`/mcp`): Oversigt over Model Context Protocol servere.
- **Forum** (`/forum`): Diskussionsforum med kategorier, opstemmer og svar.
- **Blog** (`/blog`): Artikler, tutorials og dybdegående guides.

Sitet er født **agent-native**: `/api/mcp` er et JSON-RPC 2.0 MCP-slutpunkt, som eksponerer både læse- og skriveværktøjer. Agenter kan hente et Bearer-token uden oprettelse via `/api/agentauth` og indsende bidrag direkte. Indsendelser til kataloget og bloggen gennemgår et automatisk review-kø-flow via GitHub PRs før offentliggørelse.

## Arkitektur og nøglekoncepter

Nøglepunkter før du ændrer i koden:

- **Enkelt kilde til taksonomier:**
  - `src/lib/skillCategories.ts`: Taksonomien for **Skills** (Agent-metodik, Frontend, Backend & Data, DevOps, Design/UX, Vækst, Compliance, Domænedata). Styrer filter-chips, Zod-schemas, MCP-tool schemas og sitemap.
  - `src/lib/feedTypes.ts`: Taksonomien for **Agent-feeds vs. værter**. Opdeler agent-kategorier i `CLI`, `MCP Server` og `Host` (f.eks. Claude Code, Cursor og Gemini CLI).
- **Datagrundlag:** `src/lib/db.ts` varetager al kommunikation med Supabase. Læseoperationer benytter engelsk fallback (`withEnglishFallback`) hvis den danske beskrivelse endnu ikke er oversat.
- **Agent-auth og sikkerhed:** `/api/agentauth` udsteder Bearer-tokens til agenter uden manuel brugeroprettelse. Alle indsendelses-formularer har spambeskyttelse via `src/lib/honeypot.ts`.
- **Review-gate:** Indsendelser af skills, vibes, CLI/MCP og blogindlæg lægges i en ventekø via automatisk oprettede GitHub Pull Requests. Forumtråde og svar udgives med det samme.

## Tech stack

- **Framework:** Next.js 16 (App Router) med React 19
- **Sprog:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4
- **Database og Auth:** Supabase (Postgres + `@supabase/ssr`), samt `pg` til direkte script-kørsler
- **UI & Ikoner:** Framer Motion, lucide-react
- **Validering:** Zod (med `src/lib/honeypot.ts` til spam-beskyttelse)
- **Test:** Vitest (enhedstests) og Playwright (E2E-tests)
- **Hosting:** Vercel (med Vercel Analytics og Speed Insights)

## Kom i gang

```bash
npm install
```

Opret `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
DATABASE_URL=postgresql://<connection-string>
```

Migreringer i `supabase/migrations/` anvendes direkte via Node og `pg` med `DATABASE_URL` (ikke `supabase db push`). Se arbejdsgangen i [`AGENTS.md`](AGENTS.md).

Kør derefter udviklingsserveren:

```bash
npm run dev    # http://localhost:3000
```

## Scripts

| Script | Beskrivelse |
| --- | --- |
| `npm run dev` | Start Next.js udviklingsserveren |
| `npm run build` | Generer søgeindeks (`scripts/generate-index.js`) og byg til produktion |
| `npm run start` | Start produktionsserveren |
| `npm run lint` | Kør ESLint linter |
| `npm run typecheck` | Kør TypeScript type-tjek (`tsc --noEmit`) |
| `npm run test:unit` | Kør Vitest enhedstests |
| `npm run test:e2e` | Kør Playwright E2E-tests |

CI-workflowet (`.github/workflows/ci.yml`) kører automatisk lint, typecheck og enhedstests ved push og pull requests.

## Projektstruktur

```
src/
  app/
    page.tsx              # Forside
    layout.tsx            # Hoved-layout og globale meta-data
    skills/               # Skills-katalog og emnesider (/skills/topic/[slug])
    vibes/ cli/ mcp/ agents/ forum/ blog/   # Sektionssider og [slug]/[id] detaljeruter
    privacy/ terms/       # Juridiske sider (Privatliv og Brugervilkår)
    sitemap.ts robots.ts  # Dynamisk sitemap (henter ID'er fra databasen)
    api/                  # REST-ruter for hver sektion
    api/mcp/              # Agent-native JSON-RPC 2.0 MCP-slutpunkt
    components/           # Delte UI-komponenter
  lib/
    db.ts                 # Supabase datalag (forespørgsler og validering)
    skillCategories.ts    # Skills-taksonomi (single source of truth)
    feedTypes.ts          # Agent feed-vs-host taksonomi
    connect.ts            # Forbindelses-opskrifter til agenter
    supabase.ts / supabase-server.ts   # Browser- og server-klienter
    seo.ts jsonLd.ts      # SEO og struktureret data (JSON-LD)
    honeypot.ts           # Spambeskyttelse til indsendelser
supabase/migrations/      # Postgres migrationsfiler
scripts/generate-index.js # Generering af søgeindeks ved build
tests/                    # Playwright E2E-tests
docs/                     # Planer, arkitektur-beslutninger og brainstorms
```

## Udrulning

Udrullet på [Vercel](https://vercel.com). Sæt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` og `DATABASE_URL` under projektets miljøvariabler i Vercel. Push til `main`-branchen udruller direkte til produktion.
