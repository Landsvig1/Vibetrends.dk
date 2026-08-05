-- Constrain `slug`: unique per table, and NOT NULL.
--
-- ---------------------------------------------------------------------------
-- DO NOT APPLY THIS UNTIL BOTH OF THESE ARE TRUE:
--
--   * scripts/backfill-slugs.mjs has run and every row has a slug
--     (`select count(*) from public.skills where slug is null` returns 0, and
--      the same on vibes and agents), AND
--   * the Phase B code is DEPLOYED to production — the createSkill /
--     createProject / createAgent in src/lib/db.ts that write a slug on insert.
--
-- Applying NOT NULL while the deployed code still inserts without a slug makes
-- every new submission 500. That failure is invisible from SQL: the migration
-- succeeds, every verification query below passes, and the only symptom is
-- POSTs failing in production. This exact class of mistake (migration ahead of
-- the code that tolerates it) took search down for ~15 minutes on 2026-08-04.
--
-- The same applies to scripts/seed-e2e-fixtures.mjs, which now writes fixture
-- slugs — but it runs from the branch under test, so it is only safe once the
-- branch carrying that change is merged. Its inserts share one transaction, so
-- a single violation rolls back the whole fixture set and fails the required
-- e2e check on every open PR.
-- ---------------------------------------------------------------------------
--
-- Unique rather than merely indexed: uniqueness is what lets the app resolve a
-- slug with .single() and what makes the insert-path retry (`x`, `x-2`, …)
-- meaningful — without it a collision would silently produce two rows sharing
-- a URL and .single() would start erroring on a live page.
--
-- On agents the index is table-wide, not per (category, slug): /cli and /mcp
-- are two surfaces over one table, and a CLI and an MCP server sharing a name
-- would otherwise map to one slug reachable at two paths.
--
-- Idempotent: `if not exists` on the indexes, and `set not null` is a no-op
-- when the constraint is already in place.
--
-- Reversible / rollback (drop the constraint before the index — neither
-- depends on the other, but this order leaves the table usable throughout):
--
--   alter table public.skills alter column slug drop not null;
--   alter table public.vibes  alter column slug drop not null;
--   alter table public.agents alter column slug drop not null;
--   drop index if exists public.skills_slug_key;
--   drop index if exists public.vibes_slug_key;
--   drop index if exists public.agents_slug_key;

create unique index if not exists skills_slug_key on public.skills (slug);
create unique index if not exists vibes_slug_key  on public.vibes  (slug);
create unique index if not exists agents_slug_key on public.agents (slug);

alter table public.skills alter column slug set not null;
alter table public.vibes  alter column slug set not null;
alter table public.agents alter column slug set not null;

-- ---------------------------------------------------------------------------
-- PRE-MIGRATION CHECK (run these BEFORE the statements above; all must be 0)
-- ---------------------------------------------------------------------------
--   select count(*) from public.skills where slug is null;
--   select count(*) from public.vibes  where slug is null;
--   select count(*) from public.agents where slug is null;
--
--   select slug, count(*) from public.skills group by slug having count(*) > 1;
--   select slug, count(*) from public.vibes  group by slug having count(*) > 1;
--   select slug, count(*) from public.agents group by slug having count(*) > 1;
--
-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ---------------------------------------------------------------------------
--   -- Expect NO, NO, NO:
--   select table_name, is_nullable from information_schema.columns
--   where table_schema = 'public' and column_name = 'slug'
--     and table_name in ('skills','vibes','agents') order by table_name;
--
--   -- No row took a slug that a static route already owns (expect 0):
--   select count(*) from public.skills where slug = 'topic';
--
--   -- Then verify from the OUTSIDE, not just from SQL:
--   --   * POST a submission through /api/skills and confirm it returns 201
--   --   * curl -sI https://vibetrends.dk/skills/{some-id} shows 308 to its slug
--   --   * the slug URL it points at returns 200
