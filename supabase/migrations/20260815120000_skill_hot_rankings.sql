-- The weekly, externally-sourced Hot ranking for /skills.
--
-- Replaces the frozen launch snapshot in 20260620020000_seed_skills_snapshot.sql,
-- whose own header calls hot_rank / trending_rank "a hand-curated snapshot for
-- launch" and "the seam the eventual own-signal engine replaces". Those columns
-- are deliberately NOT dropped here (see the bottom of this file).
--
-- ORDERING — this migration must land AFTER the read code that tolerates it,
-- the same rule as 20260813000000_review_state.sql. src/lib/db.ts's
-- getCurrentHotRanking() returns null on any error, including "relation does
-- not exist", so the Hot board is simply absent between the code deploy and
-- this migration. Applying this first would be harmless too (an empty table
-- reads the same as a missing one), but the rule is worth keeping intact:
-- reversing it took search down for ~15 minutes once already.
--
-- Idempotent and reversible: every statement is add-if-not-exists or
-- drop-then-create, and the down path is at the bottom of this file in a
-- comment. Nothing here tracks applied state (this project has no
-- supabase_migrations table — see AGENTS.md), so re-runs must be safe.

begin;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
--
-- One row per (week, skill). `published_at` is the instant the ranking was
-- approved, and it is what the read path measures staleness against — not the
-- ISO week label, which is a human-readable key for the manifest filename
-- (rankings/skills-hot/<YYYY-Www>.md) and for spotting a skipped week by eye.
--
-- Whole weeks are inserted and read together. The read path takes the newest
-- `published_at`, drops everything older, and refuses the board entirely when
-- that instant is more than 14 days old (HOT_RANKING_MAX_AGE_MS in
-- src/lib/db.ts). A scan that stops running therefore takes its own board down
-- instead of freezing, which is the exact defect this table retires.
--
-- `sources` carries the per-source contribution behind each position. It is not
-- read by the app; it exists so a ranking can be audited after the fact against
-- the PR that proposed it, which is what makes "curated, never scraped"
-- checkable rather than merely asserted.

create table if not exists public.skill_hot_rankings (
  week          text not null,
  skill_id      text not null references public.skills(id) on delete cascade,
  position      integer not null,
  score         numeric,
  sources       jsonb,
  published_at  timestamptz not null default now(),
  primary key (week, skill_id)
);

-- The read path's only query shape: newest published_at first, then position.
create index if not exists skill_hot_rankings_published_idx
  on public.skill_hot_rankings (published_at desc, position asc);

-- A week must not contain the same position twice, or "the ranking" stops
-- being an ordering.
create unique index if not exists skill_hot_rankings_week_position_idx
  on public.skill_hot_rankings (week, position);

-- ---------------------------------------------------------------------------
-- 2. RLS: public read, no public write
-- ---------------------------------------------------------------------------
--
-- Rankings are written only by the resolve workflow using the service role,
-- which bypasses RLS. There is no authenticated-user path that should ever
-- insert here: a visitor who could write a ranking could put any skill at
-- position 1, and the human merge gate would be decorative.

alter table public.skill_hot_rankings enable row level security;

drop policy if exists "Hot rankings are publicly readable" on public.skill_hot_rankings;
create policy "Hot rankings are publicly readable"
  on public.skill_hot_rankings
  for select
  using (true);

commit;

-- ---------------------------------------------------------------------------
-- Deliberately NOT done here
-- ---------------------------------------------------------------------------
--
-- `skills.hot_rank` and `skills.trending_rank` are left in place as dead
-- columns. Nothing reads them after this release (they are marked @deprecated
-- in the SkillRow type in src/lib/db.ts). Keeping them means rolling this
-- release back needs no reverse migration. A follow-up drops them once this has
-- been stable for a release:
--
--   alter table public.skills drop column if exists hot_rank;
--   alter table public.skills drop column if exists trending_rank;

-- ---------------------------------------------------------------------------
-- Down path
-- ---------------------------------------------------------------------------
--
--   drop policy if exists "Hot rankings are publicly readable" on public.skill_hot_rankings;
--   drop index if exists public.skill_hot_rankings_week_position_idx;
--   drop index if exists public.skill_hot_rankings_published_idx;
--   drop table if exists public.skill_hot_rankings;
--
-- Reverting the table alone is safe at any time: getCurrentHotRanking() treats
-- the missing relation exactly as it treats an empty one, and the board
-- disappears rather than erroring.
