-- Remap the skills.category column onto vibetrends' new skills-specific
-- taxonomy that now lives as the single source of truth in
-- src/lib/skillCategories.ts (renamed from topics.ts — see git history).
--
-- This is the THIRD taxonomy iteration on this column:
--   1. 20260620000000_skills_topic_taxonomy.sql — skills.sh-mirrored slugs
--   2. 20260623000000_skills_category_remap.sql — discipline-oriented slugs
--      (full-stack, marketing, webshop, front-end, back-end, design,
--      agent-workflows) — this is the migration this file replaces.
--   3. This migration — an 8-slug "kind of help" taxonomy (agent-methodology,
--      frontend, backend-data, fullstack-devops, design-ux, growth-content,
--      compliance, domain-data), grounded in a full read of all 105 current
--      skill titles rather than a discipline guess. See
--      docs/plans/2026-07-02-001-refactor-skills-categorization-taxonomy-plan.md
--      for the full rationale.
--
-- Coarse old -> new mapping (every prior discipline slug has an explicit
-- target — see the plan's Key Technical Decisions table):
--   back-end         -> backend-data
--   agent-workflows  -> agent-methodology
--   front-end        -> frontend
--   full-stack       -> fullstack-devops
--   webshop          -> fullstack-devops  (was already near-empty)
--   design           -> design-ux
--   marketing        -> growth-content    (renamed away from "marketing" to
--                                          avoid a second trigger of the
--                                          Vercel Firewall "marketing"
--                                          substring rule — see the plan's
--                                          Problem Frame; this does NOT fix
--                                          that bug, only avoids adding to it)
--
-- The coarse mapping alone is NOT sufficient: back-end and agent-workflows
-- each mix genuinely different skills (e.g. "Drizzle" and "Boliga Property
-- Data" were both filed under back-end). Step 2 below is an explicit
-- per-title override for every skill known at plan-authoring time to need
-- reassignment beyond its old bucket's coarse default — the Danish
-- domain-data-lookup skills (into domain-data) and the two GDPR skills (into
-- compliance). This mirrors the "MANUAL REVIEW BEFORE PRODUCTION" pattern in
-- 20260622000000_agent_feed_recategorization.sql.
--
-- !! MANUAL REVIEW BEFORE PRODUCTION !!
-- The override list below is representative, not exhaustive (built from
-- titles visible at plan-authoring time). Before/after applying, run the
-- POST-MIGRATION VERIFICATION queries below AND the required semantic
-- read-through of the full title -> category listing (per the plan's U2 unit)
-- to catch any row this coarse+override pass got wrong.
--
-- Reversibility: the pre-migration (discipline-era) value is snapshotted into
-- a NEW column, category_legacy_v2, NOT the existing category_legacy column —
-- that column already holds the FIRST-era (skills.sh-slug) values from the
-- 2026-06-23 migration and must not be overwritten. Rollback:
--   update public.skills set category = category_legacy_v2 where category_legacy_v2 is not null;
--
-- Idempotent: once values are in the new 8-slug set, the old-slug predicates
-- match nothing and every statement is a no-op on re-run. category_legacy_v2
-- is only ever written when null, so re-runs never overwrite the
-- first-captured original.

-- 0. Snapshot the pre-migration (discipline-era) category for reversibility.
alter table public.skills add column if not exists category_legacy_v2 text;
update public.skills set category_legacy_v2 = category where category_legacy_v2 is null;

-- 1. Coarse mapping: every prior discipline slug to its default new slug.
update public.skills
set category = case category
  when 'back-end'        then 'backend-data'
  when 'agent-workflows'  then 'agent-methodology'
  when 'front-end'        then 'frontend'
  when 'full-stack'       then 'fullstack-devops'
  when 'webshop'          then 'fullstack-devops'
  when 'design'           then 'design-ux'
  when 'marketing'        then 'growth-content'
  else category
end
where category in
  ('back-end', 'agent-workflows', 'front-end', 'full-stack', 'webshop', 'design', 'marketing');

-- 2. Manual override: known misclassifications the coarse mapping above
--    cannot distinguish, applied AFTER the coarse pass. Danish domain-data
--    lookup skills (imported from github.com/mikkelkrogsholm/skills) — into
--    domain-data regardless of where the coarse pass placed them.
update public.skills
set category = 'domain-data'
where title_da in (
  'Boliga Property Data',
  'Boligsiden Property Data',
  'Jobbank Search',
  'Jobdanmark Search',
  'Jobindex Search',
  'Jobnet Search',
  'medRxiv Search',
  'PubMed Database',
  'Rejseplanen',
  'Salling Food Waste'
);

-- 3. Manual override: the two GDPR/compliance skills (imported from
--    github.com/mikkelkrogsholm/dev-skills) — into compliance.
update public.skills
set category = 'compliance'
where title_da in (
  'GDPR for Developers',
  'GDPR Data Processing Agreement Generator'
);

-- 4. Manual override, found during the required post-migration semantic
--    read-through (per the plan's U2 unit): observability/background-jobs/ops
--    tooling and "Playwright CLI" all landed one coarse-mapping step short of
--    where they belong (back-end / agent-workflows -> fullstack-devops) —
--    the ops tools because the plan's rationale scopes them as cross-cutting
--    ops tooling rather than the data layer, and Playwright CLI because it's
--    a testing/automation tool, not an agent planning/debugging methodology
--    skill, and belongs alongside its sibling playwright-cli /
--    playwright-best-practices.
update public.skills
set category = 'fullstack-devops'
where title_da in (
  'Sentry',
  'OpenTelemetry',
  'OpenObserve',
  'Temporal',
  'Trigger.dev',
  'BullMQ',
  'Upstash',
  'Resend',
  'Playwright CLI'
);

-- 5. Manual override, found during the same read-through: "SEO & GEO" was
--    filed under frontend at import time as a workaround for the Vercel
--    Firewall "marketing" substring rule (see Problem Frame) — it belongs
--    with its growth-content siblings (ai-seo, seo-audit, content-strategy).
update public.skills
set category = 'growth-content'
where title_da = 'SEO & GEO';

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Category distribution — sanity-check the split:
--   select category, count(*) as n from public.skills group by category order by n desc;
--   -- Must return 0 — no discipline-era slug left on any row:
--   select count(*) from public.skills
--   where category in ('back-end','agent-workflows','front-end','full-stack','webshop','design','marketing');
--   -- Must return 0 — every row has a reversibility snapshot:
--   select count(*) from public.skills where category_legacy_v2 is null;
--   -- Compare to pre-migration total — rows are recategorized, never deleted.
--   select count(*) as total_rows from public.skills;
--   -- REQUIRED semantic check (not automatable) — full title -> category
--   -- read-through, per the plan's U2 unit. Read every row, not just counts:
--   select title_da, category from public.skills order by category, title_da;
--
-- ROLLBACK (reverses the remap using the snapshot):
--   update public.skills set category = category_legacy_v2 where category_legacy_v2 is not null;
