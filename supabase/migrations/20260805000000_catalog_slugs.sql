-- Add a nullable `slug` column to the three catalog tables.
--
-- Phase B of docs/plans/2026-08-04-001-feat-danish-descriptions-slugs-lastmod-plan.md:
-- detail pages move from /skills/s_1785096155359 to /skills/{title-derived-slug},
-- with the old id URLs kept alive as a real 308 issued from src/proxy.ts.
--
-- ONE file for all three tables rather than the three the plan sketched
-- (skills, then vibes, then agents): Phase B ships as a single PR, so the
-- meaningful boundary is not per-table — it is the two points in the sequence
-- where it is safe to touch the database at all. See the ordering note below.
--
-- ---------------------------------------------------------------------------
-- ORDER OF OPERATIONS — this migration is step 1 of 4, and the order is not
-- negotiable. Getting it wrong takes production down in one of two ways:
--
--   1. THIS migration (adds the nullable column).            <- safe any time
--   2. scripts/backfill-slugs.mjs                            <- fills every row
--   3. Deploy the Phase B code.                              <- reads/writes slug
--   4. supabase/migrations/20260805001000_catalog_slugs_not_null.sql
--
-- Running 4 before 3 makes every new submission 500: the deployed createSkill /
-- createProject / createAgent do not write a slug yet, and the insert violates
-- NOT NULL. Running 3 before 1 breaks the same three writes the other way —
-- PostgREST rejects an insert naming a column that does not exist.
--
-- Deploying 3 before 2 is survivable but ugly: every detail page falls back to
-- its id URL and the proxy answers id requests with a 503 (see catalogTarget in
-- src/proxy.ts, which deliberately does not 404 a slugless row).
-- ---------------------------------------------------------------------------
--
-- The column is nullable here on purpose: `add column ... not null` against a
-- populated table needs a default, and a default would have to be a value the
-- slug rules never produce.
--
-- Idempotent: `add column if not exists` is a no-op on re-run.
--
-- Reversible / rollback:
--
--   alter table public.skills drop column if exists slug;
--   alter table public.vibes  drop column if exists slug;
--   alter table public.agents drop column if exists slug;
--
-- (Dropping the column also drops the unique indexes added by the step-4
-- migration, so the rollback is the same either way round.)

alter table public.skills add column if not exists slug text;
alter table public.vibes  add column if not exists slug text;
alter table public.agents add column if not exists slug text;

comment on column public.skills.slug is
  'URL slug for /skills/{slug}. Derived from title_en by slugify() in src/lib/slug.ts at insert time. STABLE: never regenerate it on a title edit — every already-indexed URL would break with no redirect behind it.';
comment on column public.vibes.slug is
  'URL slug for /vibes/{slug}. See public.skills.slug.';
comment on column public.agents.slug is
  'URL slug for /cli/{slug} and /mcp/{slug}. Derived from name. Unique table-wide rather than per category, so a CLI and an MCP server sharing a name get distinct slugs. See public.skills.slug.';

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- The column exists and is nullable on all three (expect YES, YES, YES):
--   select table_name, is_nullable from information_schema.columns
--   where table_schema = 'public' and column_name = 'slug'
--     and table_name in ('skills','vibes','agents') order by table_name;
--
--   -- Nothing is filled in yet (expect the full row count of each table):
--   select count(*) from public.skills where slug is null;
--   select count(*) from public.vibes  where slug is null;
--   select count(*) from public.agents where slug is null;
