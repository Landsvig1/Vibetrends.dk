# Implementation Plan: Pure Claude/LLM Skills & Authentic Descriptions

- **Date:** 2026-08-17
- **Plan ID:** 2026-08-17-001-feat-pure-llm-skills-and-authentic-descriptions-plan
- **Branch:** `feature/pure-llm-skills-authentic-descriptions`

## 1. Problem Statement & Scope

### Problem
1. **Non-LLM Tools on the Hot Board:** The current scan allows standalone CLI binaries, build systems, trace visualizers, and deployment wrappers (e.g. `orca-cli`, `traceknot`, `turborepo`, `vercel-optimize`) into the catalog and Hot rankings. Vibetrends' core value proposition is curated skills and workflows that are **100% workable directly by Claude** (prompts, review loops, markdown instructions, agent personas like `grill-me`, `ponytail`, `hyperframes`, `compound-engineering`).
2. **Low-Quality Placeholder Descriptions:** Newly discovered skills were provisioned with the template string `"Trending AI skill for ${title}."`, which provides zero value or insight to users.

### Scope
- Add strict filtering (`isPureLlmSkill`) to reject CLI tools, compiler/build toolchains, and deployment/infra wrappers.
- Update `scripts/scan-hot-skills.mjs` to fetch and parse authentic `SKILL.md` frontmatter descriptions from upstream GitHub repositories.
- Create a script/migration to backfill `public.skills` with real descriptions and remove/unapprove non-LLM tools.
- Update unit tests and verify the new Hot board proposal.

---

## 2. Technical Architecture & Decisions

### Decision 1: Pure LLM Skill Filter Rule (`isPureLlmSkill`)
Filter criteria in `src/lib/hotMerge.ts`:
- Drop entries where slug, title, or repo matches CLI binaries, build tools, or hosting CLIs (`orca-cli`, `traceknot`, `turborepo`, `webpack`, `vite-plugin`, `vercel-optimize`, `tmux`, `daemon`, etc.).
- Allow genuine Claude/LLM prompt & workflow skills (e.g. `grill-me`, `ponytail`, `hyperframes`, `compound-engineering`, `tdd`, `frontend-design`, `better-colors`, `better-typography`, `writing-adrs`, `review-loop`, `cavecrew`, `email-best-practices`).

### Decision 2: Upstream Description Extraction
In `scripts/scan-hot-skills.mjs`:
- Add `fetchUpstreamSkillDescription(repo, slug, fallbackTitle)`:
  - Searches standard GitHub raw paths:
    - `https://raw.githubusercontent.com/${repo}/main/skills/${slug}/SKILL.md`
    - `https://raw.githubusercontent.com/${repo}/main/skills/*/${slug}/SKILL.md` (via subdirs: productivity, engineering, misc, design)
    - `https://raw.githubusercontent.com/${repo}/main/${slug}/SKILL.md`
    - `https://raw.githubusercontent.com/${repo}/main/SKILL.md`
  - Parses YAML frontmatter `description:` (handling single/double quotes, folded strings `>` and `|`).
  - Cleans and normalizes to a punchy 1–2 sentence description.
  - If no `SKILL.md` exists, extracts GitHub repo description via GitHub API or provides a high-signal domain description (never `"Trending AI skill for X"`).

### Decision 3: Backfill Database
- Script `scripts/backfill-skill-descriptions.mjs` to:
  - Unapprove/delete non-LLM tools (`orca-cli`, `traceknot`).
  - Update `public.skills.description_en` for newly provisioned rows with real descriptions.

---

## 3. Implementation Units & Files

### Unit 1: Pure LLM Skill Filter & hotMerge Updates
- **Files:** `src/lib/hotMerge.ts`, `src/lib/__tests__/hotMerge.test.ts`
- Implement `isPureLlmSkill()`, update `buildBoard()` and `mergeSources()`.
- Add test scenarios for CLI/build tool rejection and pure LLM skill retention.

### Unit 2: Authentic Description Fetching in Scanner
- **Files:** `scripts/scan-hot-skills.mjs`, `scripts/__tests__/hotRankingManifest.test.mjs`
- Implement `fetchUpstreamSkillDescription()` to pull real YAML frontmatter descriptions.
- Pass enriched descriptions into manifest `## New Skills Metadata`.

### Unit 3: Database Backfill & Cleanup
- **Files:** `scripts/backfill-skill-descriptions.mjs`
- Update existing database rows in `public.skills` with real descriptions and remove `orca-cli` and `traceknot`.

---

## 4. Test Scenarios

1. `hotMerge.test.ts`:
   - Rejects `orca-cli`, `traceknot`, `turborepo`, `vercel-optimize`, `genmedia-labs`.
   - Accepts `grill-me`, `ponytail`, `product-launch-video` (hyperframes), `tdd`, `better-typography`, `ce-plan`.
2. `hotRankingManifest.test.mjs`:
   - Correctly parses real multi-sentence descriptions with special characters and markdown formatting.
3. Unit test suite passes with 0 lint/type errors (`npm run test:unit`, `npm run typecheck`, `npm run lint`).
