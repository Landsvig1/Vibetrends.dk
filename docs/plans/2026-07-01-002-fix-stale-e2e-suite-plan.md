---
title: "fix: repair e2e test suite drift and add CI fixture data"
date: 2026-07-01
type: fix
depth: standard
deepened: 2026-07-01
---

## Summary

`tests/e2e/basic.spec.ts` fails 5 of 7 tests against the current production
build. All 5 trace to the same root cause — the suite was never updated
after several already-merged redesigns (#23 vibes card simplification, #24
forum sidebar refactor, #25 homepage repositioning, plus the forum
bilingual-labels feature) — not to app bugs. This plan updates the stale
assertions to match current behavior, and adds seed/cleanup fixture data so
the forum and CLI feed tests have deterministic content to assert against
instead of depending on whatever happens to exist in production.

**A review pass found the original fixture-data design wouldn't survive
contact with CI as drafted:** the `e2e` job has no `DATABASE_URL` secret to
run the seed script with, `agents` has no timestamp column for the planned
age-based cleanup, and the plan's own "fixed idempotent id" and "unique
per-run id" framings contradicted each other. All three are resolved below
(KTD2, KTD5) rather than left as gaps.

---

## Problem Frame

Confirmed via local reproduction (`CI=true npx playwright test` against a
real production build with real Supabase credentials — the CI secrets gap
from the prior CI-fix work is not a factor here):

1. **Homepage hero text is stale.** The test asserts the old hero copy
   (`"Tools til dig og dine agenter"`, and separately
   `"Hubben for danske Vibe Coders & AI-byggere"` / `"The Hub for Danish Vibe
   Coders & AI Builders"` in the language-toggle test). The actual current
   copy (`src/lib/translations.ts`, `home.hero_title`) is `"Se hvad folk
   bygger med AI."` (da) / `"Get inspired. Show what you built."` (en) —
   changed in the #25 homepage repositioning. Nav item assertions in the
   same test are still correct and pass.
2. **Forum category assertion uses the wrong locale.** The test asserts a
   button named `"General"` (`exact: true`). The category *key* `"General"`
   still exists (`src/lib/forumCategories.ts`), but the bilingual-labels
   feature (`docs/brainstorms/2026-06-24-forum-category-source-of-truth-requirements.md`,
   already shipped) resolves it to the Danish label `"Generelt"` by default —
   the app defaults to `vibe_lang=da` and the test never sets a language
   cookie. This is a locale mismatch, not a missing category.
3. **Forum and CLI feed tests have no data to assert against.** `thread-card`
   count is 0 (no forum threads exist in the live production DB right now)
   and `cli-card` count is 0 (no CLI entries exist). Both testids are correct
   in the code (`src/app/components/AgentsExplorer.tsx:203`) — this is a pure
   data-availability gap, not a code or testid drift issue.
4. **The vibes click-through test asserts removed product behavior.** The
   test clicks a `project-card` expecting `page.waitForURL(/\/vibes\/.+/)`.
   Reading `src/app/vibes/page.tsx:271-328` confirms the card `<div>` itself
   has no click handler or link — the only interactive elements are the
   delete button, the upvote button, and a `"Se Projekt"` CTA that opens
   `project.demoUrl` in a new tab (`target="_blank"`, rendered
   unconditionally regardless of whether `demoUrl` is empty). This matches
   PR #23's commit message exactly ("simplify card to thumbnail, title, desc,
   Se Projekt CTA") — the click-to-detail-page flow was deliberately
   removed, not broken. **This plan updates the test to match; it does not
   reintroduce card-to-detail-page navigation, which would be a product
   change outside this plan's scope.**

---

## Requirements

- R1. Homepage and language-toggle tests assert the current hero copy in
  both `da` and `en`, sourced from `src/lib/translations.ts` rather than
  hardcoded guesses.
- R2. The forum category assertion checks the locale-correct label
  (`"Generelt"` under the default `da` locale, or explicitly sets `en` and
  checks `"General"` — pick one and be consistent with how the rest of the
  suite handles locale).
- R3. The forum and CLI feed tests run against known, deterministic fixture
  data (a seeded thread, a seeded CLI entry) rather than depending on
  whatever exists in production at run time.
- R4. Fixture data inserted for e2e is cleaned up reliably, including when a
  run crashes or is cancelled, and does not collide with a concurrently
  running CI job's fixtures — it must not accumulate in, or corrupt, the
  production database run over run.
- R5. The vibes test asserts the current CTA-link behavior (a `"Se Projekt"`
  /`showcase.visit` link pointing at `project.demoUrl`, opening in a new
  tab) instead of an internal detail-page navigation that no longer exists.
- R6. Fixture rows are excluded from `sitemap.xml`, so a briefly-live fixture
  thread or CLI entry is never crawled or indexed.

---

## Key Technical Decisions

**KTD1 — Fixture rows live in the same production database, tagged and
self-cleaning, not a separate Supabase branch.** The user's stated preference
was "seed/fixture data for CI," which could mean either a dedicated Supabase
branch/project or tagged rows in the existing database with cleanup. This
plan chooses the latter: a Supabase branch requires a Management API
personal access token (not just the anon key already available), replaying
every migration onto the branch, and provisioning/teardown logic in CI — a
meaningfully larger infra commitment for a project with no existing
branching setup. Tagged same-database fixtures get the determinism benefit
at a fraction of the setup cost. Documented as an alternative below in case
fixture volume or flakiness later justifies the heavier approach.

**KTD2 — Fixture ids embed a per-run timestamp, following the existing
`p_<epoch>`/`s_<epoch>` convention — not a fixed shared id.** The original
draft assumed a fixed id (`e2e-fixture-thread`) re-seeded idempotently, which
a review pass caught as unsafe: two CI runs racing (the `e2e` job triggers on
every `pull_request` and push to `main`, so overlap is realistic, not
hypothetical) would either collide on the primary-key insert or have one
run's cleanup delete the other's still-in-use fixture mid-test — reproducing
the exact "no data to assert against" failure this plan exists to fix. It
also created an unrelated problem: `agents` has no `created_at` column at
all (confirmed against every migration in `supabase/migrations/`), so an
age-based cleanup query has nothing to check for the CLI fixture.

Resolving both at once: mint fixture ids as `e2e-fixture-thread-<epoch-ms>`
and `e2e-fixture-cli-<epoch-ms>` — unique per run by construction, and the
staleness check parses the embedded epoch directly out of the id string (no
new column, no migration needed), the same way `createProject`/`createSkill`
already embed `Date.now()` in `p_`/`s_` ids. Threshold: 30 minutes — longer
than any observed local e2e run (~6 minutes) with comfortable margin, short
enough that a hung run's fixture doesn't survive to collide with the next
scheduled run.

**KTD3 — Locale-explicit forum assertion, matching the toggle test's own
pattern.** Rather than asserting the ambient default locale (fragile if the
default ever changes), the forum test follows the same explicit-locale
pattern the language-toggle test already establishes: assert against
whichever label corresponds to the locale actually in effect at that point
in the test, named explicitly in a comment referencing
`src/lib/forumCategories.ts` as the source of truth. (Playwright gives each
test a fresh browser context by default, so U1's locale-toggling test cannot
leak a language cookie into U4's forum test — no special isolation code
needed.)

**KTD4 — Rewrite, not delete, the vibes navigation test; empty-`demoUrl`
edge case confirmed unreachable, not deferred.** The test still has value —
it should verify the CTA link's `href` matches `project.demoUrl` and that it
opens in a new tab (`target="_blank"`), which are the properties that
actually matter post-#23. A direct query against production
(`select count(*) filter (where demo_url is null or demo_url = '')`)
confirms 0 of the 9 current rows have an empty `demoUrl` — so the test
asserts the happy path only and does not need to branch on this case.

**KTD5 — The seed script needs `DATABASE_URL` as a new CI secret; the `e2e`
job's env block currently has none.** The original draft directed the seed
script to use the project's documented `pg`/`DATABASE_URL` pattern
(`AGENTS.md`) without noticing `.github/workflows/ci.yml`'s `e2e` job only
injects `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` — this
would have failed on the first real CI run, invisible in local testing
because `.env.local` has `DATABASE_URL` already. U3 now includes adding
`DATABASE_URL` to the `e2e` job's env block as an explicit step (the value
already exists in `.env.local`; this is a repo-secret addition, not a new
credential to provision).

**KTD6 — Sitemap excludes fixture rows.** `src/app/sitemap.ts` calls
`getThreads()`/`getCli()` unconditionally and lists every returned row in
`sitemap.xml` (daily-changefreq for `/forum`, weekly for detail pages); a
companion in-flight plan is adding richer `DiscussionForumPosting` structured
data to forum pages specifically to improve crawl uptake. A fixture thread
inserted mid-run is exactly the kind of content that gets picked up fast —
if indexed before teardown, the result is a real SERP entry that 404s after
cleanup, not just "a stray visible thread." Filtering `id LIKE
'e2e-fixture-%'` out of `sitemap.ts`'s queries closes this before it can
happen, independent of how fast teardown runs.

---

## Scope Boundaries

**In scope:** updating stale assertions in `tests/e2e/basic.spec.ts`; adding
a seed/cleanup fixture script for forum threads and CLI entries; wiring that
script into `.github/workflows/ci.yml`'s `e2e` job (including the new
`DATABASE_URL` secret) and into a local npm script for developer use;
excluding fixture rows from the sitemap.

**Out of scope:**
- Reintroducing vibes-card-to-detail-page click navigation — that's a
  product decision belonging to whoever owns the #23 redesign, not this
  test-repair plan.
- The `quality` CI gate, the `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` secrets,
  and the `search_vibes` MCP test rename — already fixed and merged (PR
  #28). `DATABASE_URL` (KTD5) is a new, distinct secret this plan adds.
- A full Supabase branch-per-CI-run setup (see KTD1) — deferred below.
- General end-to-end coverage expansion beyond repairing the existing 7
  tests (e.g. new flows, new pages) — not requested, would be a separate
  scoping conversation.

### Deferred to Follow-Up Work

- Supabase branch-per-CI-run for full environment isolation, if same-database
  tagged fixtures prove insufficient (flaky due to concurrent PR runs writing
  to the same table, for instance).
- A drift-guardrail: some lightweight check (even just a checklist item in
  PR review) that flags when a redesign touches copy or interaction patterns
  the e2e suite asserts on, so this doesn't silently re-drift.

---

## Implementation Units

### U1. Fix homepage and language-toggle hero-text assertions

**Goal:** Homepage and language-toggle tests assert the actual current hero
copy in both locales.

**Requirements:** R1

**Dependencies:** none

**Files:**
- `tests/e2e/basic.spec.ts` (the `"should load the homepage..."` and
  `"should toggle language..."` tests)

**Approach:** Replace the four stale hero-text string literals with the
current values from `src/lib/translations.ts`'s `home.hero_title` key
(`"Se hvad folk bygger med AI."` / `"Get inspired. Show what you built."`).
Nav-item assertions in the same tests are already correct — leave them.

**Patterns to follow:** the existing test's own retry-with-`toPass` pattern
for post-click assertions (already correct, don't restructure it).

**Test scenarios:**
- Happy path: homepage load asserts the current Danish hero text and passes.
- Happy path: toggling to English asserts the current English hero text and
  passes; toggling back to Danish asserts the Danish text again.
- Regression: nav-item visibility assertions (unchanged) still pass.

**Verification:** `npx playwright test tests/e2e/basic.spec.ts -g "homepage|toggle language"` passes against a real production build.

---

### U2. Rewrite the vibes test for current CTA-link behavior

**Goal:** The vibes test asserts the actual current showcase interaction
(external CTA link) instead of a removed internal navigation flow.

**Requirements:** R5

**Dependencies:** none

**Files:**
- `tests/e2e/basic.spec.ts` (the `"should navigate to Showcase..."` test)

**Approach:** Replace the click-and-`waitForURL` assertion with: locate the
first `project-card`, find its `"Se Projekt"`/CTA link (matching
`showcase.visit`'s rendered text or a stable selector), and assert its
`href` equals the card's `demoUrl` and that it carries `target="_blank"`.
Keep the existing `project-card` visibility and count assertions — those
still hold (9 real cards exist in production). Per KTD4, the empty-`demoUrl`
case is confirmed unreachable in current data — assert the happy path only,
no branching logic needed.

**Patterns to follow:** existing `data-testid="project-card"` locator usage
already in the test.

**Test scenarios:**
- Happy path: the first project card is visible, and its CTA link's `href`
  matches its `demoUrl` and opens in a new tab (`target="_blank"`).

**Verification:** The rewritten assertion passes against production data
without depending on any internal `/vibes/[id]` navigation.

---

### U3. e2e fixture seed + cleanup script, wired into CI

**Goal:** Give the forum and CLI feed tests deterministic content to assert
against, without permanently polluting production data, without colliding
across concurrent CI runs, and without exposing fixture content to search
crawlers.

**Requirements:** R3, R4, R6

**Dependencies:** none

**Files:**
- `scripts/seed-e2e-fixtures.mjs` (new — inserts one forum thread and one
  CLI/agent entry, each id-tagged `e2e-fixture-thread-<epoch-ms>` /
  `e2e-fixture-cli-<epoch-ms>` per KTD2; deletes any `e2e-fixture-*` row
  whose embedded epoch is older than 30 minutes before inserting)
- `tests/e2e/global-teardown.ts` (new, wired via `playwright.config.ts`'s
  `globalTeardown` — deletes the exact fixture ids this run's seed step
  created)
- `src/app/sitemap.ts` (add an `id NOT LIKE 'e2e-fixture-%'` exclusion — or
  equivalent JS-side filter — to the thread/CLI queries, per KTD6)
- `.github/workflows/ci.yml` (the `e2e` job: add `DATABASE_URL` to the env
  block per KTD5, sourced from a new repo secret; run the seed script before
  `npm run test:e2e`)
- `package.json` (new script, e.g. `test:e2e:seed`, so the fixture script is
  runnable locally too)

**Approach:** Use the project's documented `node --env-file-if-exists=.env.local`
+ `pg`/`DATABASE_URL` pattern (`AGENTS.md`) for the insert/delete, consistent
with how other one-off scripts in this repo talk to the database (a direct
Postgres connection bypasses RLS entirely, so no `auth.users` row or session
is needed — both `forum_threads.user_id` and `agents.user_id` are nullable).
The seed script prints the ids it inserted (e.g. to stdout, or a small JSON
file Playwright's `globalTeardown` reads) so teardown deletes precisely
those rows rather than a broad `LIKE` sweep that could catch a sibling run's
still-active fixture.

**Patterns to follow:** `supabase/migrations/20260620020000_seed_skills_snapshot.sql`
as precedent for seeding recognizable content into these tables;
`src/lib/db.ts`'s `createProject`/`createSkill` for the `p_`/`s_`
epoch-embedded id convention this plan extends; `src/scripts/migrate-direct.mjs`
as an existing precedent for a direct-`pg` script against this exact schema.

**Test scenarios:**
- Happy path: running the seed script inserts exactly one forum thread and
  one CLI entry, each with a uniquely-timestamped `e2e-fixture-` id.
- Happy path: running the seed script twice in immediate succession (two
  ids minted less than a second apart) does not error or collide — ids are
  unique by construction, not by a duplicate check.
- Edge case: a stale fixture row from a crashed prior run (embedded epoch
  older than 30 minutes) is deleted before the fresh insert; a fixture row
  from a run that started 5 minutes ago is left alone.
- Integration: the global teardown runs after the full Playwright suite
  completes and removes only the ids this run's seed step created, verified
  by a direct query showing zero rows for those specific ids remain — a
  concurrently-seeded sibling run's fixture (different epoch, different id)
  is unaffected.
- Regression: `sitemap.xml` generated while a fixture row exists does not
  list its URL.

**Verification:** After a full local `npm run test:e2e:seed && npx playwright
test`, querying `forum_threads`/`agents` for the specific ids this run
created returns zero rows once the suite (including teardown) completes;
`curl localhost:3000/sitemap.xml` during the run shows no `e2e-fixture-`
URLs.

---

### U4. Fix the forum test's category-locale assertion and rely on seeded data

**Goal:** The forum test passes against real content (the U3 fixture thread)
with a locale-correct category assertion.

**Requirements:** R2, R3

**Dependencies:** U3

**Files:**
- `tests/e2e/basic.spec.ts` (the `"should navigate to Forum..."` test)

**Approach:** Per KTD3, assert the category button using whichever label
matches the locale actually in effect at that point in the test (the suite
defaults to `da`, so `"Generelt"`, sourced from
`src/lib/forumCategories.ts`'s `FORUM_CATEGORIES` — not a guessed string).
The `thread-card` assertions now resolve against the U3-seeded thread
instead of an empty table; seed the fixture thread under the `"General"`
category key specifically so this assertion and the category-filter click
exercise the same category.

**Test scenarios:**
- Happy path: the category button renders the correct locale label and is
  visible.
- Happy path: the seeded thread's card is visible, clicking it navigates to
  its detail page, and the detail page's `h1` matches the thread's title
  (existing assertion shape, now backed by real seeded data instead of an
  empty table).

**Verification:** The forum test passes end-to-end using only the U3 fixture
thread — no dependency on whatever else happens to be in production.

---

### U5. Fix the CLI feed test to rely on seeded data

**Goal:** The CLI feed test passes against real content (the U3 fixture CLI
entry) — the testid itself was already correct.

**Requirements:** R3

**Dependencies:** U3

**Files:**
- `tests/e2e/basic.spec.ts` (the `"should navigate to the CLIs feed"` test)
- `scripts/seed-e2e-fixtures.mjs` (the CLI fixture's exact field shape, see
  Approach)

**Approach:** No selector changes needed (`cli-card`,
`getByRole('heading', { name: /System Prompt/i })`, and the `connect-block`
testid in `src/app/components/AgentsExplorer.tsx` are all already correct).
Per the design review, the connect-block is a multi-host, multi-state
component — rather than leaving its exact requirements implicit, the U3
fixture's `agents` row must set `category: 'CLI'` and populate
`install_command`/`system_prompt_da`/`system_prompt_en` with real non-empty
values (read `AgentDetailView.tsx` and `AgentsExplorer.tsx`'s connect-block
rendering to confirm exactly which fields it reads before writing the seed
row). The test asserts only the `claude-code` host option (matching the
existing test's `connect-host-claude-code` locator) — other host options in
the picker are out of scope for this repair pass; they were never asserted
before and adding new coverage isn't this plan's job (see Scope Boundaries).

**Test scenarios:**
- Happy path: the CLI feed heading and first `cli-card` are visible.
- Happy path: clicking through to the detail page shows the "System Prompt"
  heading and a visible connect-block; selecting the Claude Code host shows
  the expected steps text.

**Verification:** The CLI feed test passes end-to-end using only the U3
fixture entry.

---

## Risks & Dependencies

- **Concurrent PR runs writing to the same production tables (KTD1's
  trade-off).** Resolved by KTD2's per-run-unique ids and exact-id teardown
  (not a broad `LIKE` sweep) — two overlapping runs no longer collide or
  delete each other's fixtures. Revisit if CI volume grows enough that even
  unique-id overlap causes contention on the tables themselves (unlikely at
  current scale) — see Deferred to Follow-Up Work.
- **`DATABASE_URL` must be added as a new repo secret (KTD5)** before this
  plan's CI wiring can run — this is an explicit U3 step, not an assumption.
- **Teardown reliability.** KTD2's self-healing pre-insert cleanup (age-based,
  parsed from the id) is the real safety net; the `afterAll` teardown is the
  fast path, not the only path. Verify both independently (U3's test
  scenarios cover this).
- **Fixture rows are briefly visible on the live public site** between
  insertion and cleanup (same-database approach, per KTD1) — mitigated for
  search-crawl exposure specifically by KTD6's sitemap exclusion. A human
  visitor could still see an `e2e-fixture-`-prefixed thread/CLI entry for the
  run's duration; acceptable given the short window and clear naming.

---

## Sources & Research

- Local reproduction: `CI=true npx playwright test` against a real
  production build, using the Supabase secrets fixed in PR #28 — confirmed
  all 4 root causes above directly rather than inferring them from CI logs.
- `docs/brainstorms/2026-06-24-forum-category-source-of-truth-requirements.md` —
  the shipped bilingual-labels feature that explains the forum category
  locale mismatch (KTD3).
- `src/lib/forumCategories.ts`, `src/lib/translations.ts`,
  `src/app/vibes/page.tsx`, `src/app/components/AgentsExplorer.tsx` — read
  directly to confirm current strings, testids, and interaction shape.
- `supabase/migrations/` (all files) — confirmed `agents` has no
  `created_at` column (KTD2) and every `user_id` column referenced is
  nullable (U3's Approach).
- `src/scripts/migrate-direct.mjs` — confirmed direct-`pg` inserts into
  `forum_threads`/`agents` already work against this schema without a real
  auth user.
- `src/app/sitemap.ts` — confirmed it lists every `getThreads()`/`getCli()`
  row unconditionally (KTD6).
- `.github/workflows/ci.yml` — confirmed the `e2e` job's current env block
  has no `DATABASE_URL` (KTD5).
- `supabase/migrations/20260620020000_seed_skills_snapshot.sql` — precedent
  for seeding recognizable content, referenced in U3.
- Git history: PR #23 ("refactor(vibes): simplify card to thumbnail, title,
  desc, Se Projekt CTA"), #24 ("refactor(forum): remove placeholder
  sidebar"), #25 ("Grid out homepage sections... homepage positioning") —
  the redesigns that caused the drift this plan repairs.
- A 4-persona review pass (coherence, feasibility, design-lens, adversarial)
  surfaced KTD2, KTD5, KTD6, and the U5 fixture-shape specificity — see
  inline attributions above.
