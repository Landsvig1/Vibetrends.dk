-- Add is_danish + denmark_specific flags to public.agents, mirroring the same
-- pair on public.skills (20260702120000_skills_is_danish.sql,
-- 20260703000001_skills_denmark_specific.sql). They back the Dansk tab on
-- /cli and /mcp: is_danish = tool from a Danish contributor;
-- denmark_specific = tool specifically about Denmark (sorted first within
-- the Dansk view). Subset invariant: denmark_specific implies is_danish.
--
-- No backfill: the agents table is empty at migration time (verified 0 rows).
-- Future imports set the flags at insert time or via manual UPDATE.
--
-- Idempotent: add column if not exists is a no-op on re-run.
-- Reversible / rollback:
--   alter table public.agents drop column if exists denmark_specific;
--   alter table public.agents drop column if exists is_danish;

alter table public.agents add column if not exists is_danish boolean not null default false;
alter table public.agents add column if not exists denmark_specific boolean not null default false;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Columns exist with boolean/false defaults:
--   select column_name, data_type, column_default from information_schema.columns
--   where table_name = 'agents' and column_name in ('is_danish','denmark_specific');
--   -- Subset invariant (expect 0):
--   select count(*) from public.agents where denmark_specific and not is_danish;
