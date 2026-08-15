-- Weekly baselines for the Hot scan, so "hot" means velocity and not size.
--
-- The problem this solves: the sources publish totals, not weekly movement.
-- skills.sh exposes an absolute `installs` count (and a day-over-day `change`,
-- which is the wrong window for a weekly board); the GitHub API exposes
-- `stargazers_count` and no history at all. Ranking on those totals directly
-- would produce a "most installed ever" board that barely moves between weeks
-- and rewards age over momentum.
--
-- So each run records what it saw, and the next run diffs against it. The first
-- run therefore has no baseline and contributes no velocity — that is expected,
-- and scripts/scan-hot-skills.mjs reports it in the pull request body rather
-- than quietly emitting a ranking with one source silently absent.
--
-- ORDERING: safe in either direction. The scan treats a missing table exactly
-- as it treats a missing baseline (no velocity, reported), so this can land
-- before or after the workflow that writes to it.
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
-- `entry_key` is the scan's own identity for a ranked thing: "owner/repo#slug"
-- where a repo is known, bare slug otherwise (see entryKey in
-- src/lib/hotMerge.ts). It is deliberately NOT a foreign key to skills.id:
-- snapshots cover everything the sources rank, including entries this catalog
-- does not carry and may never carry. Constraining it to the catalog would
-- throw away the baseline for a skill that gets submitted later, and the first
-- week after it lands would show no velocity for it.
--
-- `value` is bigint: install counts across the whole leaderboard already run
-- past a million, and a source could reasonably report a larger total.

create table if not exists public.hot_source_snapshots (
  week         text not null,
  source       text not null,
  entry_key    text not null,
  value        bigint not null,
  captured_at  timestamptz not null default now(),
  primary key (week, source, entry_key)
);

-- The scan's only query: the most recent snapshot for a source, before now.
create index if not exists hot_source_snapshots_source_captured_idx
  on public.hot_source_snapshots (source, captured_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS: no public access at all
-- ---------------------------------------------------------------------------
--
-- Unlike skill_hot_rankings, nothing user-facing reads this. It is scan
-- bookkeeping, written and read by the workflow with the service role, which
-- bypasses RLS. Enabling RLS with no policy is therefore the correct state:
-- the anon and authenticated roles get nothing.
--
-- It is not secret, just useless to a visitor, and a public read would let
-- anyone enumerate the scan's history for free.

alter table public.hot_source_snapshots enable row level security;

commit;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
--
-- Two snapshots are enough to compute a delta, but a few months of history
-- makes it possible to audit a past ranking against what the sources actually
-- said at the time. There is no automatic cleanup: at roughly 500 rows per
-- source per week this is a few hundred thousand rows a year, which Postgres
-- does not notice. Revisit if that stops being true.
--
--   delete from public.hot_source_snapshots where captured_at < now() - interval '1 year';

-- ---------------------------------------------------------------------------
-- Down path
-- ---------------------------------------------------------------------------
--
--   drop index if exists public.hot_source_snapshots_source_captured_idx;
--   drop table if exists public.hot_source_snapshots;
--
-- Dropping this costs the scan its velocity signal for one week (it rebuilds a
-- baseline on the next run) and nothing else. The read path never touches it.
