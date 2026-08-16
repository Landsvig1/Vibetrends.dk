# Plan: Auto-onboard New Trending Skills in Hot Ranking Pipeline

**Goal:** Allow the weekly Hot scan to rank top trending skills regardless of whether they already exist in Vibetrends' `public.skills` catalog, and automatically provision newly discovered skills into `public.skills` when the ranking PR is merged.

---

## 1. Problem Frame & Objectives

### Current State
* `src/lib/hotMerge.ts` and `scripts/scan-hot-skills.mjs` discard any top hot skill from `skills.sh` / GitHub Stars / Hacker News that does not match an existing approved row in `public.skills`.
* This restricts the "Hotteste globalt" board exclusively to the 99 seeded skills, preventing discovery and onboarding of new trending AI skills.
* Upstream top movers (e.g. `ai-music`, `video-edit`, `reddit-automation`, `review-loop`, `handoff`, `tdd`) are relegated to an unranked intake list in the PR description.

### Desired State
1. **Unconstrained Hot Ranking:** The top 20 movers across external sources form the Hot board.
2. **Catalog Linkage vs. Auto-Onboarding:**
   - Existing catalog skills link to their existing `public.skills(id)`.
   - New skills not in catalog are included on the board, flagged as new additions in the PR, and defined with full catalog metadata (`title`, `slug`, `github_url`, `category`, `description_en`, `tags`, `review_state='approved'`).
3. **Automated Provisioning on Merge:**
   - When the ranking PR is merged into `main`, `scripts/publish-hot-ranking.mjs` inserts any new skills into `public.skills` (increasing total catalog size) and inserts all 20 rows into `public.skill_hot_rankings`.
4. **Stable Weeks:**
   - When all hot skills are already in the catalog, only positions update without duplicate insertions.

---

## 2. Architecture & Design Decisions

### 2.1 Topic / Category Inference
`public.skills` requires `category` to be one of the 8 taxonomy topics:
`'frontend-ui' | 'backend-data' | 'fullstack-devops' | 'design-ux' | 'growth-content' | 'compliance' | 'domain-data' | 'cli'`.
* We will implement a lightweight keyword-based topic classifier in `src/lib/hotMerge.ts` (`inferSkillCategory(slug, description, repo)`).
* Default fallback: `'fullstack-devops'` (or `'cli'` if CLI tool).

### 2.2 Skill Metadata for New Entries
For new skills from `skills.sh`:
* `id`: deterministic generation `s_${Date.now()}_${index}` or hash-based `s_hot_${slug}`.
* `title_en` & `title_da`: Normalized title from slug (e.g. `ai-music` &rarr; `"AI Music"`).
* `slug`: unique slugified name.
* `vibe_coder`: repo owner or `"Community"`.
* `vibe_coder_title_da`: `"Community-bidragyder"`.
* `vibe_coder_title_en`: `"Community Contributor"`.
* `rating`: `5.0`, `reviews_count`: `0`.
* `description_en`: Extracted from upstream or generated description (e.g. `"Trending AI skill for ${slug}."`).
* `description_da`: `null` (leaving null allows `withEnglishFallback` to work per `AGENTS.md`).
* `category`: Inferred topic.
* `tags`: `[slug, category, 'hot']`.
* `github_url`: `https://github.com/${repo}` (if repo is present).
* `source`: `source` URL or `skills.sh` URL.
* `review_state`: `'approved'`.
* `is_danish`: `false`.

### 2.3 Manifest Schema & Round-Trip Parsing
In `rankings/skills-hot/YYYY-Www.md`:
* Table retains the clean column structure: `| # | Skill | Skill ID | Score | Sources |`.
* For existing skills: `Skill ID` is `` `seed_...` `` or `` `s_...` ``.
* For new skills: `Skill ID` is `` `new:<slug>` `` or `` `s_...` ``.
* A structured Markdown/JSON section `## New Skills Metadata` is appended to the manifest containing the full JSON payload for all new skills proposed in this week.
* `parseManifest` in `scripts/publish-hot-ranking.mjs` extracts:
  1. Ranking positions (1..20).
  2. New skill objects to insert.

### 2.4 Publisher DB Transaction
In `scripts/publish-hot-ranking.mjs`:
* Wrapped in `BEGIN ... COMMIT`.
* Step 1: Check which `new:` skills already exist in `public.skills` (by slug/repo). If not, `INSERT INTO public.skills (...) VALUES (...) RETURNING id`.
* Step 2: `INSERT INTO public.skill_hot_rankings (week, skill_id, position, score, sources, published_at) VALUES (...)`.
* Step 3: Call `POST /api/revalidate` with `tags: ['skills-list']`.

---

## 3. Implementation Units & Files

1. **`src/lib/hotMerge.ts` & `src/lib/__tests__/hotMerge.test.ts`**
   - Update `matchToCatalog` or add `buildHotBoardWithNewSkills(ranked, catalog)`.
   - Add topic classifier helper `inferSkillCategory`.
   - Update unit tests to verify both existing catalog matches and new skill creation.

2. **`scripts/scan-hot-skills.mjs`**
   - Update scan runner to rank top 20 items regardless of prior catalog existence.
   - Include `newSkills` payload in `renderManifest`.
   - Update PR body rendering to distinguish "Existing Catalog Skills" from "New Skills Added to Catalog".

3. **`scripts/publish-hot-ranking.mjs` & `scripts/__tests__/hotRankingManifest.test.mjs`**
   - Update `parseManifest` to parse both table rows and `## New Skills Metadata`.
   - Update DB publisher to insert newly provisioned skills into `public.skills` within the transaction before writing to `skill_hot_rankings`.
   - Update tests to verify manifest round-trip with new skills.

---

## 4. Test Scenarios

- **Unit tests:**
  - `hotMerge.test.ts`: test merging when all entries are new, when all entries are existing, and mixed.
  - `hotRankingManifest.test.mjs`: test rendering and parsing manifest with new skill metadata block.
- **Dry-run verification:**
  - Run `node --env-file=.env.local scripts/scan-hot-skills.mjs --dry-run` and verify top 20 board contains top trending skills with proper metadata.
- **CI / E2E:**
  - `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`.
