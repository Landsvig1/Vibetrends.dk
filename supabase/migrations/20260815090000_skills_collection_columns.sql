-- Collections: provenance for skills imported from a repo holding several
-- SKILL.md files. Both columns are metadata that travel with a row; nothing
-- groups on them. No board renders a collection card, so every existing count
-- and view is unaffected by this migration.
--
-- Ordering: the read path ships first. src/lib/db.ts selects skills with
-- select('*') and maps these two keys through `|| undefined`, so the code
-- tolerates both the pre-migration state (keys absent) and the post-migration
-- state (keys null or populated). Deploy that, then run this.
--
-- Idempotent and reversible: nothing tracks applied state here, so re-running
-- must be safe. See the down-migration at the bottom.

begin;

alter table public.skills
  add column if not exists collection_slug text,
  add column if not exists collection_title text;

comment on column public.skills.collection_slug is
  'Kebab-case repo identifier for a multi-skill import (e.g. dev-skills). Null for a standalone skill. Provenance only: no board or view groups by this.';
comment on column public.skills.collection_title is
  'Human-readable collection name (e.g. Dev Skills). Null for a standalone skill.';

-- Partial index: only a minority of rows carry a collection, and the only
-- read is "count/list the members of this collection" (getCollectionSize).
create index if not exists skills_collection_slug_idx
  on public.skills (collection_slug)
  where collection_slug is not null;

-- Backfill the collections that already exist in the catalog. Keyed off
-- `source`/`github_url` pointing at the upstream repo, so re-running is a
-- no-op once the values match. Each statement is scoped to rows that do not
-- already carry the value, which keeps this safe on repeat.
update public.skills set collection_slug = 'dev-skills', collection_title = 'Dev Skills'
  where (source ilike '%mikkelkrogsholm/dev-skills%' or github_url ilike '%mikkelkrogsholm/dev-skills%')
    and collection_slug is distinct from 'dev-skills';

update public.skills set collection_slug = 'mikkelkrogsholm-skills', collection_title = 'Mikkel Krogsholm Skills'
  where (source ilike '%mikkelkrogsholm/skills%' or github_url ilike '%mikkelkrogsholm/skills%')
    and source not ilike '%dev-skills%'
    and github_url not ilike '%dev-skills%'
    and collection_slug is distinct from 'mikkelkrogsholm-skills';

-- No `superpowers` statement. The plan doc lists obra/superpowers as a
-- 7-row collection, but verified against the live DB on 2026-08-15 the
-- catalog holds zero rows matching 'superpower' in source, github_url or
-- title. Importing it is separate work; a backfill for absent rows would
-- just be an untested no-op asserting something false.

update public.skills set collection_slug = 'vercel-agent-skills', collection_title = 'Vercel Agent Skills'
  where (source ilike '%vercel-labs/agent-skills%' or github_url ilike '%vercel-labs/agent-skills%')
    and collection_slug is distinct from 'vercel-agent-skills';

update public.skills set collection_slug = 'marketingskills', collection_title = 'Marketing Skills'
  where (source ilike '%marketingskills%' or github_url ilike '%marketingskills%')
    and collection_slug is distinct from 'marketingskills';

update public.skills set collection_slug = 'expo-skills', collection_title = 'Expo Skills'
  where (source ilike '%expo/%' or github_url ilike '%expo/%')
    and collection_slug is distinct from 'expo-skills';

update public.skills set collection_slug = 'anthropic-skills', collection_title = 'Anthropic Skills'
  where (source ilike '%anthropics/%' or github_url ilike '%anthropics/%')
    and collection_slug is distinct from 'anthropic-skills';

commit;

-- Down migration. Run this block alone to reverse:
--
-- begin;
-- drop index if exists public.skills_collection_slug_idx;
-- alter table public.skills
--   drop column if exists collection_slug,
--   drop column if exists collection_title;
-- commit;
