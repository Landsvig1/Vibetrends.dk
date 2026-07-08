-- Add is_danish + denmark_specific flags to public.vibes and public.forum_threads,
-- mirroring the same pair already on public.skills and public.agents
-- (20260702120000_skills_is_danish.sql, 20260703000001_skills_denmark_specific.sql,
-- 20260703020000_agents_danish_flags.sql). They back the new Dansk tab on
-- /vibes (Dansk/Alle/Hot) and /forum (Dansk/Top/Nyeste): is_danish = content
-- from a Danish contributor; denmark_specific = content specifically about
-- Denmark (sorted first within the Dansk view). Subset invariant:
-- denmark_specific implies is_danish.
--
-- Backfill: inspected via a one-off script (AGENTS.md — MCP can't reach this
-- project). Every existing row in both tables is genuinely Danish — all 9
-- vibes are .dk-domain products from Danish authors/companies (Panoptik,
-- OCUPIE ApS, Vibers' Nest, Digital Arv, StåStærkt, Evolving Memory Art,
-- Skarnlabs, CVR API, Rentemester), and the sole forum thread is a Danish-
-- language post by Kasper Landsvig. So is_danish is backfilled true for every
-- current row. No denmark_specific backfill — unlike Skills' Danish job/
-- property lookups, none of these are unambiguously "about Denmark" as a
-- topic (vs. just being Danish products), so the tie-break falls through to
-- upvotes like the agents migration's zero-backfill precedent.
--
-- Idempotent: add column if not exists; the backfill converges (re-runs set
-- the same value). Reversible / rollback:
--   alter table public.vibes drop column if exists denmark_specific;
--   alter table public.vibes drop column if exists is_danish;
--   alter table public.forum_threads drop column if exists denmark_specific;
--   alter table public.forum_threads drop column if exists is_danish;

alter table public.vibes add column if not exists is_danish boolean not null default false;
alter table public.vibes add column if not exists denmark_specific boolean not null default false;

alter table public.forum_threads add column if not exists is_danish boolean not null default false;
alter table public.forum_threads add column if not exists denmark_specific boolean not null default false;

update public.vibes
set is_danish = true
where is_danish = false;

update public.forum_threads
set is_danish = true
where is_danish = false;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Every existing row should now be is_danish (expect the current row counts):
--   select count(*) from public.vibes where is_danish;
--   select count(*) from public.forum_threads where is_danish;
--   -- Subset invariant (expect 0 on both):
--   select count(*) from public.vibes where denmark_specific and not is_danish;
--   select count(*) from public.forum_threads where denmark_specific and not is_danish;
