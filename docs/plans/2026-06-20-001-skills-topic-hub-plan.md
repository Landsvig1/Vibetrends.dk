---
title: "feature: Skills topic hub — copy-first launch, community-evolved (template for the rest)"
type: feature
date: 2026-06-20
status: ready
depth: deep
area: skills
---

# feature: Skills topic hub

## Summary

Turn `/skills` from a flat grid with four invented categories into a **topic hub** built on the skills.sh domain taxonomy. The section is the first to get a real identity, and the patterns here (single bilingual taxonomy source of truth, per-topic SEO landings, swap-in-place smart-views) become the **template** for showcase / agents / forum / blog.

**Launch strategy — copy-first.** Don't build an engine before there's fuel. For v1 we **copy skills.sh content as seed data** (the 8 topics + real skill entries per topic + the Hot/Trending orderings) to remove the placeholder feel immediately. This snapshot is explicitly temporary — over time the catalog is rebuilt by Kasper and the community through the existing submit flow. So the plan is deliberately split:

- **Now (ship):** bilingual taxonomy, topic landings, seeded content, Hot/Trending shown as copied snapshot lists. No new DB engine.
- **Over time (evolve):** swap Hot/Trending from the static snapshot to **own community signals** (upvotes/velocity). The toggle UI is built forward-compatible so this is a data-source swap, not a UI rewrite.

Two hard requirements from the user thread:
1. **Every topic is translated to Danish** for the DA toggle.
2. **Everything is easily replaced moving forward** — taxonomy and seed content each live behind one obvious edit point, because "this will change a lot."

---

## Problem Frame

`src/app/skills/page.tsx` hardcodes `categories = ["All", "Prompting", "Agents", "Automation", "Fullstack"]` (line 71) — a vocabulary that exists nowhere else and matches nothing external. The same list is duplicated as a Zod enum (`src/app/api/skills/route.ts:9`) and as `<option>`s in the submit form (`page.tsx:309-312`, default `subCat = "Prompting"`). The page renders one undifferentiated grid; no topic has a point of view, and there's no surface for crawlers to rank on "Next.js skills" etc.

"Placeholder" = the section has no identity and invented words. The fix is to adopt skills.sh's real taxonomy + seed it with real content, translated, behind clean swap points.

skills.sh ships:
- **8 topics** (`/topic`): Frontend & React, Next.js, Design & UI, Mobile, Agent workflows, Database, Testing, Marketing — each a card with description + count at `/topic/[slug]`.
- **Hot** (`/hot`) — 24h velocity board. **Trending** (`/trending`) — 24h install-count board.

We copy the taxonomy and a content snapshot now; we earn our own Hot/Trending later.

## Goals & Non-Goals

**Goals**
- One **bilingual** taxonomy (8 topics, `da` + `en`) as the single source of truth driving the filter bar, submit form, Zod validation, hub cards, topic landings, and sitemap.
- Each topic populated with real seed content copied from skills.sh (attributed), so nothing looks empty at launch.
- A per-topic SEO landing (`/skills/topic/[slug]`) with hero, count, curated pick, filtered grid, metadata, OG image, JSON-LD.
- Hot/Trending toggles that work at launch off the copied snapshot, built so the data source can later swap to own signals without UI changes.
- Both taxonomy and seed content trivially replaceable (one file each).

**Non-Goals (this pass)**
- No own-signal upvote engine yet (deferred to the "over time" phase).
- No live mirroring/scraping of skills.sh — it's a one-time seed snapshot.
- No per-skill view tracking.
- No URL-based locale routing (still deferred; topic pages stay cookie-lang but gain crawlable per-topic URLs).
- Not applying the template to other sections yet.

---

## Decisions Resolved (2026-06-20, with the user)

| Decision | Choice | Consequence |
|---|---|---|
| v1 content | **Copy skills.sh snapshot** (topics + skills + hot/trending) | Removes placeholders fast; explicitly temporary; attribution noted |
| Hot/Trending source | **Snapshot now → own signals later** | Toggle UI built forward-compatible; engine deferred off critical path |
| Taxonomy | **8 topics replace 4 categories**, **bilingual** | One axis; DA + EN labels mandatory; lossy migration of existing rows |
| Replaceability | **One edit point each** (taxonomy file, seed file) | Community/Kasper reshape without code archaeology |
| "Special" scope | **Rich topic landings** | New `/skills/topic/[slug]` route + hub redesign |

---

## Key Technical Decisions

- **Single bilingual source of truth: `src/lib/topics.ts`.** One exported `TOPICS` array of `{ slug, labelDa, labelEn, descDa, descEn, icon, accent }` drives the filter chips, the submit `<select>`, the Zod enum (`z.enum(TOPIC_SLUGS)`), the hub cards, the landings, and the sitemap. This deletes the three duplicated category lists and guarantees the DA/EN labels never drift. **This file is the swap point** — changing a topic or its Danish wording is a one-line edit.

- **Seed content lives in one obvious, replaceable place.** A seed migration (or `scripts/seed-skills.*`) populated from a copied skills.sh snapshot, clearly commented as temporary launch data. Going forward, the existing submit flow + community is the real source; the seed is overwritten/pruned, not load-bearing. Each seed row carries a `source` note (e.g. the GitHub repo) for attribution.

- **Store topic *slug* in `skills.category`, map to localized label at read.** Keeps the column/shape (no rename churn across `db.ts`, RLS, detail page); the value becomes a stable slug; `mapSkill` resolves slug → `labelDa`/`labelEn` via `TOPICS`.

- **Hot/Trending = snapshot now, swap-in-place later.** At launch, Hot and Trending are two ordered seed lists copied from skills.sh (a `rank` field or a `flags` array like `['hot']` / `['trending']` on seed rows). The toggle filters on that. The data-access seam (`getSkills({ view })` in `db.ts`) is written so that "later" the body swaps from reading the snapshot flag to calling an own-signal RPC — **the API contract and the UI don't change.** That keeps the eventual own-signal work (upvote join table + velocity RPC, mirroring the existing hardened `agent_upvotes` pattern) a clean, isolated follow-up.

- **Topic landings are Server Components; the hub keeps a client filter island.** `/skills/topic/[slug]/page.tsx` renders server-side for SEO. The interactive search + Hot/Trending controls live in a small client island reused by the hub and the landings, splitting today's all-client `skills/page.tsx`. nuqs params: rename `category` → `topic`, add `view ∈ {hot, trending}`.

---

## The 8 Topics — Danish translations (DA toggle)

These are the initial DA labels; final wording is a one-line edit in `topics.ts` (intentionally easy to revise).

| slug | EN label | DA label | DA description (draft) |
|---|---|---|---|
| `frontend-react` | Frontend & React | Frontend & React | UI-komponenter, hooks og React-mønstre |
| `nextjs` | Next.js | Next.js | App Router, server components og rendering |
| `design-ui` | Design & UI | Design & UI | Styling, design systems og brugerflade |
| `mobile` | Mobile | Mobil | Mobil- og cross-platform udvikling |
| `agent-workflows` | Agent workflows | Agent-workflows | Agenter, automatiseringer og orkestrering |
| `database` | Database | Database | Skema, queries og datalag |
| `testing` | Testing | Test | Unit-, integration- og E2E-test |
| `marketing` | Marketing | Markedsføring | SEO, indhold og vækst |

(Topic *content* — skill titles/descriptions — already flows through the existing `*_da` / `*_en` columns, so seeded skills get DA/EN like every other row.)

---

## Taxonomy Migration Map (existing 4 → 8)

Lossy; assign best-fit then eyeball seeded rows. Unmapped → `agent-workflows`.

| Old category | → New slug | Notes |
|---|---|---|
| Prompting | `agent-workflows` | some may be `marketing` — review |
| Agents | `agent-workflows` | direct |
| Automation | `agent-workflows` / `database` | per-row by tags |
| Fullstack | `nextjs` / `frontend-react` | Next.js tag → `nextjs`, else `frontend-react` |

---

## Phases

### Phase 1 — Bilingual taxonomy (single source of truth)
- Create `src/lib/topics.ts` (`TOPICS`, `TOPIC_SLUGS`, helpers) with DA + EN labels/descriptions per the table above.
- Rewire and **delete** the three hardcoded category lists: Zod enum (`api/skills/route.ts`), submit `<select>` + `subCat` default, filter chips.
- `mapSkill` resolves slug → localized label. Migrate existing `skills.category` values to slugs (data migration per the map).
- Acceptance: `grep` shows zero remaining hardcoded category arrays; DA toggle shows Danish topic labels.

### Phase 2 — Seed content copied from skills.sh
- Fetch the 8 topic pages + Hot + Trending from skills.sh; extract real skill entries (name, repo/owner, description, topic).
- Write a clearly-marked, replaceable seed (migration or `scripts/seed-skills.*`) inserting them with `*_da`/`*_en` (DA can start as a translated pass or mirror EN until localized), a `source` attribution note, and snapshot `hot`/`trending` flags/ranks.
- Acceptance: every topic landing is populated; Hot and Trending lists are non-empty.

### Phase 3 — Topic landings + hub (the "special" part)
- `/skills/topic/[slug]/page.tsx` (server): hero (icon/accent/DA-EN desc), count, curated pick, filtered grid, `generateMetadata`, `opengraph-image.tsx` (reuse `lib/ogImage.tsx`), JSON-LD `ItemList`, `generateStaticParams` for the 8 slugs.
- `/skills` hub: 8 topic cards from `TOPICS` with live counts + search + Hot/Trending toggle (reads snapshot flags via the `view` seam) + submit CTA.
- Add topic URLs to `src/app/sitemap.ts`.
- Acceptance: `/skills/topic/nextjs` has unique title/OG/JSON-LD and is in `sitemap.xml`; toggles reflect in the URL.

### Phase 4 — Over time: own-signal engine (deferred, isolated)
- When community activity warrants: add `skill_upvotes` join + `upvotes` col + hardened triggers (mirror `20260618200000`), `created_at` on skills, `get_hot_skills` / `get_trending_skills` velocity RPCs, skill upvote button + `/api/skills/[id]/upvote`.
- Swap the `view` seam in `db.ts` from snapshot flags → RPCs. **No UI or API-contract change.**

### Phase 5 — Generalize the template (separate pass)
- Extract the "section identity kit" (bilingual taxonomy file + seed pattern + landing shape) and apply to showcase → agents → forum → blog.

---

## Risks & Mitigations

- **Copied content ages / has attribution concerns.** It's a one-time snapshot of public, mostly-OSS skills, carried with a `source` note, framed in copy as a starting point; community submissions replace it. Don't present it as original.
- **DA seed translations lag.** Acceptable to seed DA = EN mirror initially (the column exists), then localize; the taxonomy labels themselves are translated from day one.
- **Lossy 4→8 migration.** Map above + manual review; default `agent-workflows`; reversible.
- **Splitting the all-client page** could regress the submit modal / nuqs state. Keep the modal in the client island; cover the `topic`/`view` round-trip in E2E.
- **Cookie-lang + SSG mismatch on landings.** Render topic landings dynamically (ISR/lang-in-segment out of scope) per the deferred locale decision.
- **Over-building too early.** Explicitly guarded: Phase 4 engine is gated on real activity, not shipped speculatively.

## Verification (Phases 1–3)

- `npm run test:unit` / `typecheck` / `lint` green.
- Migration applies cleanly + idempotent; existing rows carry valid slugs.
- DA toggle renders Danish topic labels everywhere; one-line label edit in `topics.ts` propagates to chips, select, hub, landings.
- Every topic landing populated; Hot/Trending non-empty.
- `/skills?topic=nextjs&view=hot` returns the snapshot ordering; state in URL.
- Each `/skills/topic/[slug]` independently indexable (title, OG, JSON-LD, sitemap).

## Deferred / Over Time
- Own-signal Hot/Trending engine (Phase 4) — gated on community activity.
- Applying the identity kit to other sections (Phase 5).
- Per-skill view tracking; URL-based locale routing; agent **write** access — all standing follow-ups.
