-- Adds created_at to vibes so /vibes can sort "Newest" (default) alongside the
-- existing upvotes-based "Top" order. Idempotent/reversible: additive column
-- with a default, safe to re-run.
--
-- Backfill: project ids are minted as 'p_' + Date.now() (see createProject in
-- src/lib/db.ts), so the millisecond timestamp is embedded in the id for every
-- row created through the app. We recover it from the id where the suffix is
-- numeric; any row that doesn't match (hand-seeded data) falls back to now().

alter table public.vibes add column if not exists created_at timestamptz not null default now();

update public.vibes
set created_at = to_timestamp(substring(id from '^p_(\d+)$')::bigint / 1000.0)
where substring(id from '^p_(\d+)$') is not null;
