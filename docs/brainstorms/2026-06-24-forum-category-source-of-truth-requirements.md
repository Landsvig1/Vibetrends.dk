---
date: 2026-06-24
topic: forum-category-source-of-truth
---

# Forum category single source of truth + bilingual labels

## Summary

Make the forum category list a single source of truth — one module that the
TypeScript type, the Zod enum, the filter list, and the submit dropdown all
import — and give each category bilingual `da`/`en` display labels resolved by
the active `vibe_lang`, matching the existing `src/lib/topics.ts` pattern. The
existing English strings stay as the stored/canonical key, so this is a
code-only change with no database migration.

## Problem Frame

The forum category set is currently hardcoded in four independent places:

- `src/lib/db.ts` — the `ForumThread.category` union type
- `src/app/api/forum/route.ts` — the Zod `category` enum on submission
- `src/app/forum/page.tsx` — the filter array (`categories`)
- `src/app/forum/page.tsx` — the `<option>` markup in the submit modal

Adding or renaming a category means editing all four, and nothing enforces that
they agree. This contradicts the project's own stated architecture: `topics.ts`
(Skills taxonomy) and `feedTypes.ts` (agent feed taxonomy) are documented as
single sources of truth, but the forum taxonomy was never given the same
treatment. A drift here fails silently — a new category can validate
server-side while never appearing in the UI, or vice versa.

Separately, the forum is the one section where category labels are **not**
bilingual. Category text renders the raw English literal (`"Setup & Config"`)
even on Danish pages, while every other section localizes its labels. Both
problems share one fix: centralize the taxonomy and give it localized labels.

## Key Decisions

- **English strings stay the canonical key, no data migration.** Existing
  `forum_threads.category` rows store the English label (e.g. `"Setup & Config"`).
  Keeping those values as the canonical key means existing rows, the stored
  data, and the `?category=` query-param values are all unchanged. Migrations
  in this project are manual and painful (see `AGENTS.md`), so avoiding one
  keeps the change cheap and low-risk. Slug-style keys like `topics.ts` would be
  cleaner but force a migration of every existing thread — explicitly rejected.
- **Mirror the `topics.ts` shape.** A category is a canonical key plus `da`/`en`
  labels, with a helper that resolves a key + `lang` to a display label. This
  reuses an established, tested pattern rather than inventing a new one.
- **The new module is the only place the category set is declared.** The type,
  the Zod enum, the filter list, and the dropdown all derive from it. After this
  change there is exactly one edit point to add or rename a category.

## Requirements

**Single source of truth**

- R1. A single module declares the canonical forum category set; no other file
  hardcodes the list of categories.
- R2. The `ForumThread.category` type, the submission Zod enum, the forum filter
  list, and the submit-modal dropdown all derive their values from R1's module.
- R3. The canonical key for each category is its current English string, so no
  stored data, RLS policy, or query-param value changes.

**Bilingual labels**

- R4. Each category carries a `da` and an `en` display label.
- R5. Category text shown to users — on the forum list, thread cards, thread
  detail pages, the filter control, and the submit dropdown — resolves to the
  label for the active `vibe_lang`, defaulting to Danish.
- R6. The value persisted on submission and the value compared during filtering
  remain the canonical key, not the localized label.

## Acceptance Examples

- AE1. **Covers R3, R6.** A thread submitted under the category currently labeled
  "Setup & Config" stores the same string it stores today; an existing thread in
  that category still displays and filters correctly after the change.
- AE2. **Covers R4, R5.** With `vibe_lang=da`, a thread card and its detail page
  show the Danish category label; switching to `en` shows the English label, with
  no change to the underlying thread.
- AE3. **Covers R1, R2.** Adding a new category requires editing only R1's module;
  the type, Zod enum, filter, and dropdown pick it up without further edits.

## SEO & Indexing Impact

For the SEO review — what does and does not change:

- **No URL changes, no redirects, no sitemap changes.** Forum category filtering
  is client-side via a `?category=` query parameter (`nuqs`), not a route. The
  sitemap (`src/app/sitemap.ts`) indexes only `/forum` and per-thread
  `/forum/[id]` pages — there are no per-category URLs to preserve or redirect.
- **Query-param values are unchanged.** Because the English string stays the
  canonical key (R3), any existing `?category=...` link keeps working.
- **Indexable on-page text becomes correctly localized.** Thread detail pages
  (`/forum/[id]`) are in the sitemap and currently render the raw English
  category label even in Danish. After this change, category text on Danish
  pages renders Danish (R5) — visible-text localization that aligns the forum
  with the rest of the bilingual site. This is the one user/SEO-facing change.
- **No change to titles, meta descriptions, canonical tags, or hreflang.** The
  change touches a category label string only, not page metadata or the locale
  strategy.

## Scope Boundaries

Not in this round (other gaps from the agent-readability assessment):

- Doc-only pointers — the bilingual `_da`/`_en` column convention, linking the
  MCP write-deferral decision from the MCP route, documenting `nanobanana-output/`.
- A drift-guardrail test that fails when any taxonomy is hardcoded in 2+ places.
- Strengthening the Next.js 16 and migration-workflow warnings.
- Migrating `forum_threads.category` to slug-style keys — deliberately avoided
  to keep this migration-free.

## Dependencies / Assumptions

- Assumes the existing `vibe_lang` cookie and the language-resolution path used
  by `topics.ts` / the rest of the app are reused as-is.
- Assumes the four hardcoded locations listed in Problem Frame are the complete
  set; an implementer should confirm no other file references the category list
  before declaring R1 done.
