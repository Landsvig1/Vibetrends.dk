# Agent prompt: add skills and plugins to vibetrends.dk

Paste the block below to an agent. Everything above the rule is context for
you, not for it.

**Why this exists.** The catalog is 98 skills, of which `mikkelkrogsholm`
contributes 43 (44%), and his `dev-skills` repo alone is 33. All 45 skills on
the Dansk board are his 43 plus two others. That happened because multi-skill
repos were imported one row per `SKILL.md`.

**Be clear about what collections do and do not fix.** They record where a
skill came from, so a reader on a detail page can see that a row is 1 of 33
from one repo, and so the next 20-skill plugin arrives with its provenance
attached instead of as 20 anonymous rows. They do **not** fix the
concentration itself. The Dansk board is 44% one contributor because the
catalog is 44% one contributor, and no grouping rule changes that number.
Collapsing 45 rows into 3 repo cards would only have moved the board's
organizing unit from the skill to the repo, which is the repo listing drawn
one level up, not a curated catalog. The real fix for concentration is
curation and more contributors, which is Step 4's job and not this one's.

**The distinction the agent must get right.** Two different things look like
"a plugin with many skills":

- **Type A, one skill with a command surface.** One `SKILL.md`, many
  playbooks under `reference/`. `impeccable` is this: 1 `SKILL.md`, 35
  reference files, invoked as `impeccable audit` / `impeccable polish`. The
  sub-commands are *not independently installable*. This is **one** catalog
  entry, and listing 35 rows would be factually wrong.
- **Type B, one repo with many installable skills.** Many `SKILL.md` files,
  each usable alone. `dev-skills` (33), `superpowers` (7),
  `vercel-labs/agent-skills` (5). These are real separate skills that share a
  home, and they get a **collection**.

---

You are adding entries to vibetrends.dk, a Danish catalog of AI skills, CLI
tools and MCP servers. Work in the `vibetrends-dk` project.

## Before anything

1. Read `AGENTS.md` and `DESIGN.md` in the project root. They override your
   defaults.
2. Check git state. Another session may hold the worktree on its own branch.
   Branch off `origin/main` into a **new worktree**; never switch a branch out
   from under another session. Re-verify `git status` immediately before any
   git operation, not just at the start.
3. `gh pr list --state open` and confirm no open PR touches the same files.

## Step 1: classify the source, before writing anything

For each URL or repo you are given, count the `SKILL.md` files:

```bash
find <repo> -name "SKILL.md" | wc -l
```

- **Exactly 1** → **Type A**. One catalog entry. If it has a `reference/`,
  `commands/` or similar directory of playbooks, those are sub-commands.
  They belong on the detail page, not as rows. Capture the command table into
  `doc_markdown` so `.skill-doc` renders it.
- **More than 1** → **Type B**. One entry per `SKILL.md`, all sharing a
  collection (see Step 3).

Do not guess from the repo name. `mikkelkrogsholm/skills` and
`obra/superpowers` are Type B; a repo called `x-plugin` may still be Type A.
If the count is 1 but the README advertises "20 skills", trust the file count
and say so in your report.

## Step 2: write the row

Columns that matter on `public.skills`:

| column | rule |
|---|---|
| `id`, `slug` | `slug` is the URL key. Required. Kebab-case, unique. |
| `title_da`, `title_en` | Real titles. Not the slug. |
| `category` | **Must** be one of the eight below. Never invent one. |
| `description_en` | Written, not copy-pasted from the README's first line. |
| `description_da` | **Omit it.** Null means "not translated yet" and the read path falls back through `withEnglishFallback`. Writing English here permanently disables that fallback and is indistinguishable from a real translation. Migration `20260804000000` had to clean this up across 118 rows. |
| `github_url` | Point at the skill's **own subdirectory**, not the repo root. Migration `20260730000000` existed solely to fix this for expo. |
| `source` | Currently inconsistent (some repo-root, some subdir). Set it to the repo root. |
| `is_danish` | The *contributor* is Danish. |
| `denmark_specific` | The *subject* is Denmark (Danish law, DK services). Not the same thing. |
| `vibe_coder` | GitHub org or handle. |
| `review_state` | `approved`. |
| `doc_markdown`, `doc_path`, `doc_source_url` | The SKILL.md snapshot. |
| `trending_rank` | Hot board only. See Step 4. |

Valid categories, with current counts:

```
fullstack-devops (20)   backend-data (19)   frontend (18)
agent-methodology (12)  domain-data (10)    growth-content (9)
design-ux (8)           compliance (2)
```

**The database will not stop you from getting this wrong.** The eight values
live in `src/lib/skillCategories.ts:26-35` and feed `schemas.ts:14`'s
`z.enum`, so the *submit form* is guarded. There is **no enum type and no
CHECK constraint** on `skills.category`; the v3 taxonomy migration
(`20260702000000`) remaps with a plain `update`. A migration that writes rows
directly bypasses the only validation that exists, so check the spelling
yourself before COMMIT.

**This taxonomy is known to be imperfect and you must still use it.**
`fullstack-devops` is a junk drawer holding a testing cluster (6) and an
observability cluster (3); `frontend` hides a mobile/native cluster (6);
`domain-data` is really Danish public services (8) plus research databases
(2). Reworking it is separate, deliberately deferred work: the taxonomy has
already been remapped twice (`category_legacy` and `category_legacy_v2` are
both still on the table), and a third remap needs its own before/after
sample review. Do not invent a ninth category, and do not "improve" existing
rows' categories as a side effect of adding new ones.

## Step 3: collections, for Type B only

Two columns carry the grouping:

- `collection_slug`: kebab-case, stable, derived from the repo
  (`mikkelkrogsholm/dev-skills` becomes `dev-skills`)
- `collection_title`: human name (`Dev Skills`)

Both null for a standalone skill.

**No board ever groups.** This is the central rule and it is not negotiable.
Dansk, Alle, Trender and every hub keep rendering one card per skill.
`collection_slug` is metadata that travels with a row, not a board object.

The reason is the product bet, not squeamishness about the numbers. A skill
card's highest-weight affordance is `Forbind` (`.btn-primary`, deep-links to
`/skills/{slug}#connect`); `SkillCard.tsx:140-148` documents that the card was
deliberately rebuilt so connect outranks `Se på GitHub`, because the off-ramp
was winning. **A collection has no connect target.** You cannot land 33 skills
in an agent in one step. A collection card on the board would therefore either
carry a `Forbind` that lies, or drop it and remove the site's differentiator
from its own landing surface. It would also drop the category chip, the
description, the tags and the upvote heart, which is four of the skill card's
five content slots, so it cannot "look like every other card" no matter how it
is styled.

The consequence of grouping was also worse than the crowding it solved: the
Dansk board would have collapsed from 45 named skills to 3 unlabelled folders,
two of them the same contributor, and the default view of the hub would have
stopped rendering a single skill title. That converts recognition into recall
on the one surface where a mid-task builder is scanning.

So: **collections surface on detail pages, never on boards.** See Step 5.

Because nothing groups, every count on every board keeps counting cards and
skills at the same time, and the existing `aria-live` sentence
(`SkillsExplorer.tsx:424-452`), `Vis flere ({hiddenCount})`, `countByCategory`
and `skillsListJsonLd` all stay correct with no change. Do not introduce a
second counting rule.

A collection with one member gets no collection page and no sitemap entry; the
`Del af` line is simply not rendered. Grouping never shows up as a one-item
folder.

**Ship the code before the migration.** This ordering is not optional. Deploy
the read path that tolerates both null and populated collection columns
*first*, then run the migration. Reversing this order took search down for
about 15 minutes previously.

Migration rules from `AGENTS.md`: Supabase MCP and `supabase db push` do not
work here, `psql` is not installed. Apply with a one-off node script from the
project root, `node --env-file=.env.local script.mjs`, using `pg` and
`DATABASE_URL`, wrapped in BEGIN/COMMIT. Always pass
`ssl: { rejectUnauthorized: false }`; without it `node-postgres` silently
connects over plaintext and the password crosses the wire in the clear. If
`db.<ref>.supabase.co` is unreachable (it is IPv6-only), use the pooler:
host `aws-0-eu-west-1.pooler.supabase.com`, port 5432, user
`postgres.<project-ref>`, same password. Every migration idempotent and
reversible, because nothing tracks applied state.

Backfill the existing collections in the same migration:

```
dev-skills   33 rows    superpowers        7 rows
skills       10 rows    vercel-labs         5 rows
marketingskills 8 rows  expo, anthropics    4 rows each
```

## Step 4: curation for Trender

**`/skills` has no "Hot" board.** Its three boards are `danish` / `all` /
`trending` (`SkillsExplorer.tsx:197-201`), and the third is labelled
**Trender** in the UI. `/vibes`, `/cli` and `/mcp` are the hubs with a Hot
board. Use the right name; this doc previously made the exact conflation it
warns against below.

Trender is the global counterweight to Dansk. All 7 current members are
non-Danish, and that is deliberate. When adding global skills worth
featuring, set `trending_rank` (ascending, 1 is top).

`hot_rank` and `trending_rank` are set on two **disjoint** sets of 7 rows and
are different lists. `db.ts:615-617` is the read: `view === 'hot'` reads
`hot_rank`, `view === 'trending'` reads `trending_rank`. Do not conflate them
or write both.

Trender holds individual skills, never collections. To feature `dev-skills`,
rank its best one or two skills by name. "These 7 skills are worth your
time" is a stronger and more honest claim than "this 33-skill repo is."

## Step 5: presentation

Only if the site work is in scope. Otherwise report what is needed and stop.

### Boards: nothing changes

The `/skills` board is an **Operate** surface: scanability and consistency
win. Per Step 3 it keeps rendering one card per skill, so `SkillCard`,
`ListCard`, the counts and the empty states are all untouched. If your diff
edits a board explorer, you have misread Step 3.

### Skill detail page: one new line

The collection surfaces here and only here. Under the title on
`skills/[slug]/page.tsx`, render an inline link:

```
Del af Dev Skills (33)
```

Not a breadcrumb. The breadcrumb at `skills/[slug]/page.tsx:132-148` stays
`Skills / {categoryLabel} / {title}` and keeps `category` as the single
parent, because giving a skill two parents breaks the trail on pages that are
already indexed and ranking. Omit the line entirely when `collection_slug` is
null or the collection has one member.

### Collection page: `/skills/samling/[slug]`

A **Read** surface: structure for comprehension.

- **Flat, alphabetical, always.** Do not branch the layout on whether
  `category` discriminates. Measured, three of the four real collections
  (`mikkelkrogsholm/skills` 10/10 `domain-data`, `marketingskills` 8/8
  `growth-content`, `superpowers` 5+2) land in effectively one bucket, so the
  conditional would produce two layouts across four pages with no way for a
  reader to predict which. Worse, it keys off the taxonomy this document
  calls wrong in Step 2 and again under Known issues, so a deferred remap
  would silently flip the layout of indexed pages with no review.
- **Add an in-page filter input when the collection has more than 12
  members.** That is the actual problem on the 33-item page, and grouping
  never solved it.
- Reuse `.glass-card`. It carries hover, focus-within and reduced-motion
  (`globals.css:44-57`, with the reduced-motion reset at `383-386`).
- Add the page to `sitemap.ts` alongside the existing skill entries. A
  one-member collection gets no page and no sitemap entry.

### Agent surface: not optional

PRODUCT.md principle 4 is "both audiences, undegraded". A structural layer
the human catalog has and the machine catalog does not is a breach of it, and
it is the kind nobody notices because nothing on screen shows it. So:

- Add `collection_slug` and `collection_title` to the `Skill` interface
  (`db.ts:103`).
- Return them from `search_skills` in `src/app/api/mcp/route.ts` and from
  `/api/skills`.
- Update `/api/openapi.json` and add one sentence to the `search_skills` tool
  description saying what a collection is.

### Design system constraints

These apply to anything you render, on any of the surfaces above.

- Forest Ink is the only chromatic colour. No second hue, no `dark:`
  variants, no raw `slate-*`/`gray-*`/`zinc-*`, no shadows for hierarchy.
- Icons are lucide, inheriting `currentColor`. **No emoji**; a literal emoji
  is multicolour and breaks the Single Ink Rule.
- Board tabs must stay consistent across `/skills`, `/vibes`, `/cli` and
  `/mcp`, but **there is no shared `BoardTabs` component**, so consistency is
  manual. Only the selection logic is shared (`src/lib/boardTabs.ts`,
  `visibleBoards`). The rendered row is three hand-written copies serving
  four hubs (`/cli` and `/mcp` both go through `AgentsExplorer`):
  `SkillsExplorer.tsx:391-416`, `VibesExplorer.tsx:480-505`,
  `AgentsExplorer.tsx:346`, plus `ForumExplorer.tsx:433`. They have already
  drifted: `/skills` has no `visible.length > 0` guard and sets
  `aria-hidden` on the icon, `/vibes` guards it and does not. Never change one
  hub's default view or tab order alone; changing tabs means editing every
  copy, or extracting a shared component first as its own PR.
- All user-facing strings in Danish. Code and commits in English.
- `.btn-primary` is declared **unlayered** while Tailwind utilities live in
  `@layer utilities`, so padding/radius/colour/weight utilities written next
  to it are inert. Do not add them, and do not "fix" it by moving the class
  into `@layer components`; that would silently activate every existing
  override at once.

## Verify

```
npx tsc --noEmit
npx eslint src/          # 3 pre-existing warnings are expected
npx vitest run           # 950 passing in 45 files at 411c95a (~1.2s)
npm run build
```

**Do not run the e2e suite locally.** Its seeder writes to the live Supabase
DB and leaves visible fixture rows on `/vibes` and `/cli`; teardown does not
run standalone. CI runs it safely.

Then `npx next start` and look at the affected pages.

## Hard rules

- **Never commit `pnpm-lock.yaml`.** This repo uses npm. A stray pnpm
  lockfile has caused rejection of at least five PRs.
- Never copy `description_en` into `description_da`.
- Do not push without asking. Commits imperative, lowercase, max 72 chars.
- **No em dashes or en dashes** anywhere, including generated descriptions.
- Do not extract another list-item component into its own memoized
  `<XCard />`. That pattern has been hand-rolled 6+ times. If a list needs
  it, factor one shared wrapper.

## Known issues, do not fix as a side effect

Both are real and both are separate work. Report them if you touch them,
but do not bundle a fix into a plugin-ingestion PR.

- **Two duplicate rows exist**: `Playwright CLI` / `playwright-cli` (both
  `fullstack-devops`), and `Skill Creator` twice (both `agent-methodology`).
  Deduping needs a slug/redirect decision because detail pages are indexed.
- **The category taxonomy is wrong** in the ways listed in Step 2. It needs
  its own migration and its own before/after review.

## Report

State the classification (A or B) and the file count that decided it, how
many rows you wrote, which collection they landed in, anything you set
`trending_rank` on, and anything you deliberately left out.

If you touched presentation, also state: that no board explorer was modified,
which detail-page and collection-page files you changed, and whether
`collection_slug` reached the `Skill` interface, `search_skills`, `/api/skills`
and `openapi.json`. A collections change that ships to humans and not to
agents is incomplete, not partial.
