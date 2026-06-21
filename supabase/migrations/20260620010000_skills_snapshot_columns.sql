-- Columns supporting the launch content snapshot (Phase 2 of the Skills topic
-- hub plan). All nullable / additive so existing community rows are untouched.
--
--   source         : attribution for copied/seeded entries (e.g. the repo URL).
--   hot_rank       : position on the launch "Hot" board (NULL = not on it).
--   trending_rank  : position on the launch "Trending" board (NULL = not on it).
--
-- hot_rank / trending_rank are a hand-curated snapshot for launch. They are the
-- seam the eventual own-signal engine (plan Phase 4) replaces: the read path
-- orders by these columns now and by computed velocity later, with no UI change.

alter table public.skills add column if not exists source text;
alter table public.skills add column if not exists hot_rank integer;
alter table public.skills add column if not exists trending_rank integer;
