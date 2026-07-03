-- Add a denmark_specific flag to public.skills. The Dansk view (view=danish)
-- shows all skills from Danish contributors (is_danish, see
-- 20260702120000_skills_is_danish.sql) but should surface the skills that are
-- specifically ABOUT Denmark first — Danish job portals, property data,
-- transit, grocery deals — ahead of general dev tooling that happens to have
-- a Danish author. getSkills orders the danish view by this flag descending.
--
-- Backfilled for the eight Denmark-specific lookup skills. Skills like
-- medRxiv/PubMed (research, not Danish) and the GDPR pair (EU-wide) are
-- deliberately not flagged.
--
-- Idempotent: add column if not exists; the backfill converges.
-- Reversible / rollback:
--   alter table public.skills drop column if exists denmark_specific;

alter table public.skills add column if not exists denmark_specific boolean not null default false;

update public.skills
set denmark_specific = true
where title_da in (
  'Boliga Property Data',
  'Boligsiden Property Data',
  'Jobbank Search',
  'Jobdanmark Search',
  'Jobindex Search',
  'Jobnet Search',
  'Rejseplanen',
  'Salling Food Waste'
)
and denmark_specific = false;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Expect 8:
--   select count(*) from public.skills where denmark_specific;
--   -- Every denmark_specific skill must also be is_danish (subset invariant):
--   select count(*) from public.skills where denmark_specific and not is_danish; -- expect 0
