-- Add an is_danish flag to public.skills, backing the "Dansk" view on /skills
-- (replaces the Hot tab in the UI; view=danish in the API/MCP contract).
--
-- A skill is Danish when it comes from a Danish contributor. Backfilled here
-- for the 49 skills imported from github.com/mikkelkrogsholm/* (dev-skills +
-- skills). Future Danish entries set the flag at insert time or via a manual
-- UPDATE. Note: the two demo seed rows attributed to "Sofie" and "Christian"
-- (fake github.com/sofie/* and github.com/christian/* URLs) are deliberately
-- NOT flagged — they are placeholder content, not real Danish contributions.
--
-- Idempotent: add column if not exists; the backfill converges (re-runs set
-- the same value). Reversible / rollback:
--   alter table public.skills drop column if exists is_danish;

alter table public.skills add column if not exists is_danish boolean not null default false;

update public.skills
set is_danish = true
where github_url like 'https://github.com/mikkelkrogsholm/%'
  and is_danish = false;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Expect 49 (the mikkelkrogsholm imports):
--   select count(*) from public.skills where is_danish;
--   -- Spot-check the flagged titles:
--   select title_da from public.skills where is_danish order by title_da;
