---
title: "refactor: Forum category single source of truth + bilingual labels"
date: 2026-06-24
sequence: "004"
type: refactor
status: proposed
origin: docs/brainstorms/2026-06-24-forum-category-source-of-truth-requirements.md
---

# refactor: Forum category single source of truth + bilingual labels

## Summary

Centralise the forum category list into a single module — `src/lib/forumCategories.ts` — and give each category bilingual `da`/`en` display labels. All four current hardcoded locations (TypeScript type, Zod enum, filter list, submit dropdown) and the category badge render on the thread detail page derive from this module after the change. No database migration is required; the English strings remain the canonical stored keys.

---

## Problem Frame

The forum category set is currently declared in four independent places:

- `src/lib/db.ts` — the `ForumThread.category` union type
- `src/app/api/forum/route.ts` — the Zod `category` enum
- `src/app/forum/page.tsx` — the `categories` filter array and the `<option>` elements in the submit modal
- `src/app/forum/[id]/page.tsx` — renders `{thread.category}` raw (always English, regardless of `vibe_lang`)

Adding or renaming a category requires editing all four, and nothing enforces agreement. The forum is also the only section that renders category text in English even on Danish pages — every other section resolves labels through the `topics.ts` / `feedTypes.ts` bilingual helper pattern.

---

## Key Technical Decisions

**English strings stay the canonical stored key.** Existing `forum_threads.category` rows store the English label (e.g. `"Setup & Config"`). Keeping those values as-is means no migration, no `?category=` query-param breakage, and no RLS policy changes. Slug-style keys would be cleaner but force a manual migration of every existing thread — explicitly rejected per origin R3.

**Mirror `topics.ts` shape, not `feedTypes.ts`.** `topics.ts` is the closer model: its canonical key is a human-readable string (not a machine slug), it exposes `labelDa`/`labelEn` fields on the record, and its `topicLabel(key, lang)` helper falls back to the raw key when the lookup misses — exactly the behaviour needed here. `feedTypes.ts` uses machine slugs and is a different pattern.

**Single module, no translation-file keys.** Category labels go into `src/lib/forumCategories.ts` as data, not into `src/lib/translations.ts`. The `translations.ts` pattern requires a key per label in two language blocks and adds cross-file coupling. The data module is self-contained, testable, and consistent with `topics.ts`.

---

## Requirements Trace

| Requirement | Unit |
|---|---|
| R1 — Single module is the only declaration of the category set | U1 |
| R2 — Type, Zod enum, filter list, dropdown all derive from R1's module | U2, U3, U4 |
| R3 — Canonical key is the current English string; no stored data changes | U1 |
| R4 — Each category carries `da` and `en` display labels | U1 |
| R5 — Category text shown to users resolves to active `vibe_lang` label | U4, U5 |
| R6 — Persisted value and filter comparison use the canonical key, not the localized label | U3, U4 |
| AE1 — Existing thread still displays and filters correctly after the change | U2, U4 |
| AE2 — `vibe_lang=da` shows Danish label; switching to `en` shows English | U4, U5 |
| AE3 — Adding a category requires editing only the one module | U1 |

---

## Scope Boundaries

**In scope**
- Creating `src/lib/forumCategories.ts` and its test file
- Updating the four hardcoded locations to derive from the new module
- Rendering localised category labels on the list page and thread detail page

**Deferred to Follow-Up Work**
- A drift-guardrail lint rule that fails when any taxonomy is hardcoded in more than one place (mentioned in the brainstorm's Scope Boundaries)
- Migrating `forum_threads.category` to slug-style keys
- Bilingual labels for doc-only column conventions or MCP route comments

**Outside this plan's scope**
- Changes to URL structure, sitemap, `?category=` query param values, or metadata — these are unchanged per the brainstorm's SEO section

---

## Implementation Units

### U1. Create `src/lib/forumCategories.ts`

**Goal:** Declare the canonical forum category set with bilingual labels and export a resolver helper — the single source of truth all other units import.

**Requirements:** R1, R3, R4, AE3

**Dependencies:** none

**Files:**
- `src/lib/forumCategories.ts` — create
- `src/lib/__tests__/forumCategories.test.ts` — create

**Approach:**
- Export `FORUM_CATEGORY_KEYS` as a `const` tuple of the four English strings in their current order: `"General"`, `"Prompts"`, `"Showcase Discussion"`, `"Setup & Config"`.
- Derive `ForumCategoryKey` as `(typeof FORUM_CATEGORY_KEYS)[number]`.
- Define a `ForumCategory` interface with `key: ForumCategoryKey`, `labelDa: string`, `labelEn: string`.
- Export `FORUM_CATEGORIES: readonly ForumCategory[]` — one entry per key.
- Export `getForumCategory(key: string): ForumCategory | undefined` — lookup by key with a `Record` internal map, same shape as `getTopic` in `topics.ts`.
- Export `forumCategoryLabel(key: string, lang: "da" | "en" = "da"): string` — resolves to `labelDa` or `labelEn`, falls back to the raw key so a legacy or unknown value never renders blank.

**Patterns to follow:** `src/lib/topics.ts` — `TOPIC_SLUGS`, `Topic`, `TOPICS`, `getTopic`, `topicLabel`. Mirror the same shape and fallback behaviour.

**Test scenarios:**
- `getForumCategory("General")` returns the `General` record with both `labelDa` and `labelEn` populated.
- `getForumCategory("unknown-key")` returns `undefined`.
- `forumCategoryLabel("Prompts", "da")` returns the Danish label string.
- `forumCategoryLabel("Prompts", "en")` returns the English label string.
- `forumCategoryLabel("legacy-value")` falls back to `"legacy-value"` (raw key passthrough).
- `FORUM_CATEGORY_KEYS` contains exactly 4 entries; `FORUM_CATEGORIES` has length 4; entries are in the same order.

**Patterns to follow for tests:** `src/lib/__tests__/feedTypes.test.ts` — structure, import style, scenario shape.

**Verification:** Module exports type-check cleanly; vitest passes all 6 scenarios; `forumCategoryLabel("Setup & Config", "da")` returns a non-empty Danish string distinct from the English key.

---

### U2. Update `ForumThread.category` type in `src/lib/db.ts`

**Goal:** Replace the hardcoded union literal with the `ForumCategoryKey` type imported from `src/lib/forumCategories.ts`, eliminating the first hardcoded declaration.

**Requirements:** R1, R2, AE1

**Dependencies:** U1

**Files:**
- `src/lib/db.ts` — modify

**Approach:**
- Import `ForumCategoryKey` from `src/lib/forumCategories.ts`.
- Replace `category: "General" | "Prompts" | "Showcase Discussion" | "Setup & Config"` on the `ForumThread` interface with `category: ForumCategoryKey`.
- No change to `mapThread`, `createThread`, or query logic — the stored value is unchanged.

**Test scenarios:**
- `Test expectation: none — type-only change; no behavioural change; tsc --noEmit is the verification gate.`

**Verification:** `tsc --noEmit` passes; existing vitest suite passes unchanged.

---

### U3. Update Zod enum in `src/app/api/forum/route.ts`

**Goal:** Derive the Zod category enum from `FORUM_CATEGORY_KEYS` rather than a hardcoded literal array, eliminating the second hardcoded declaration.

**Requirements:** R1, R2, R6, AE1

**Dependencies:** U1

**Files:**
- `src/app/api/forum/route.ts` — modify

**Approach:**
- Import `FORUM_CATEGORY_KEYS` from `src/lib/forumCategories.ts`.
- Replace `z.enum(["General", "Prompts", "Showcase Discussion", "Setup & Config"])` with `z.enum(FORUM_CATEGORY_KEYS)`.
- No other changes to the route — validation behaviour is identical; the stored key is unchanged.

**Test scenarios:**
- `Test expectation: none — behavioural parity is the goal; schema rejects unknown values and accepts known ones exactly as before; tsc --noEmit is the verification gate.`

**Verification:** `tsc --noEmit` passes; `npx vitest run` passes.

---

### U4. Update `src/app/forum/page.tsx` — filter array, dropdown, and category badge

**Goal:** Derive the filter list and submit modal dropdown from `FORUM_CATEGORIES`, and render the localised category label on thread cards instead of the raw English key, eliminating the third and fourth hardcoded declarations and satisfying R5 on the list page.

**Requirements:** R1, R2, R5, R6, AE2, AE3

**Dependencies:** U1, U2

**Files:**
- `src/app/forum/page.tsx` — modify

**Approach:**
- Import `FORUM_CATEGORIES`, `ForumCategoryKey`, and `forumCategoryLabel` from `src/lib/forumCategories.ts`.
- Replace the hardcoded `categories` array with `["All", ...FORUM_CATEGORY_KEYS]` (type `("All" | ForumCategoryKey)[]`), preserving the "All" sentinel.
- Replace the four hardcoded `<option>` elements with `FORUM_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.labelDa}</option>)`. The submit dropdown always shows Danish labels (matches the rest of the form); the stored value remains the canonical key.
- Replace the raw `{thread.category}` render on thread cards (line 214) with `{forumCategoryLabel(thread.category, language)}` — uses the existing `language` variable from `useLanguage()`.
- The `selectedCategory` state and `?category=` query param continue to use the canonical key as the comparison value (R6).

**Test scenarios:**
- Category filter chips render Danish labels when `vibe_lang=da` and English labels when `vibe_lang=en`. Covers AE2.
- Selecting a category filter updates `?category=` to the English key (e.g. `?category=Setup+%26+Config`), not a translated label. Covers R6.
- Thread cards in the list render the Danish label for a `"Setup & Config"` thread when `vibe_lang=da`. Covers AE2.
- `Test expectation: UI-level; no Vitest unit test needed for the render. The forumCategoryLabel unit tests in U1 cover the resolver. Manual verification covers the integration.`

**Verification:** Category filter chips and thread card badges show localised text. Changing language via the language toggle updates the displayed label without changing the URL param value. Submit modal dropdown lists all 4 categories in Danish.

---

### U5. Update `src/app/forum/[id]/page.tsx` — category badge on thread detail

**Goal:** Render the localised category label on the thread detail page's category badge instead of the raw English key, satisfying R5 for the one remaining user-visible location and closing the SEO-facing bilingual gap the brainstorm called out.

**Requirements:** R5, AE2

**Dependencies:** U1, U2

**Files:**
- `src/app/forum/[id]/page.tsx` — modify

**Approach:**
- Import `forumCategoryLabel` from `src/lib/forumCategories.ts`.
- Replace `{thread.category}` (the category badge, line 112) with `{forumCategoryLabel(thread.category, lang)}`. The `lang` variable is already resolved from the `vibe_lang` cookie earlier in `ForumThreadContent`.
- No other changes to the detail page.

**Test scenarios:**
- `Test expectation: UI-level; resolver is covered by U1 unit tests. Manual verification: visit a forum thread in `da` mode and confirm the badge renders a Danish string; switch to `en` and confirm it renders the English string.`

**Verification:** The category badge on `/forum/[id]` renders `"Generelt"` (or equivalent Danish label) when `vibe_lang=da` and `"General"` when `vibe_lang=en`. The badge content is never the raw English key on a Danish page.

---

## Open Questions

None — all requirements are resolved. The brainstorm's outstanding questions were architectural (slug migration, drift guardrail) and explicitly deferred; they do not affect this implementation.

---

## Sources & Research

- Origin document: `docs/brainstorms/2026-06-24-forum-category-source-of-truth-requirements.md`
- Pattern reference: `src/lib/topics.ts` — canonical key + bilingual labels + fallback resolver
- Pattern reference: `src/lib/feedTypes.ts` — same shape, used for feed type taxonomy
- Test pattern reference: `src/lib/__tests__/feedTypes.test.ts`
- Hardcoded location audit: `src/lib/db.ts:56`, `src/app/api/forum/route.ts:10`, `src/app/forum/page.tsx:44–50` (filter) + `347–350` (dropdown), `src/app/forum/[id]/page.tsx:112` (badge)
- External research: not run — local patterns are directly applicable and well-established (3+ examples: `topics.ts`, `feedTypes.ts`, `feedTypes.test.ts`)
