-- Remove the three demo/placeholder skill rows from the original site mockup:
--   s1  "Optimering af Custom Cursor-regler (.cursorrules)"  — "Lars"
--   s2  "Design af Multi-Agent arbejdsgange (LangGraph / CrewAI)" — "Sofie"
--   s3  "Supabase Database & RLS-politik revision" — "Christian"
--
-- All three have invented authors, fabricated ratings/review counts, and
-- GitHub URLs pointing at repos that don't exist (github.com/sofie/…,
-- github.com/christian/…). Every other skill row (s_<epoch> and seed_*) is a
-- real curated entry and is untouched.
--
-- Idempotent: DELETE by fixed ids is a no-op on re-run.
-- Rollback: a full pre-deletion JSON dump of the three rows was captured at
-- apply time; they are placeholder content with no dependents (no upvote
-- tables reference skills), so restoration is a manual re-insert from that
-- dump if ever wanted.

delete from public.skills where id in ('s1', 's2', 's3');

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Must return 0:
--   select count(*) from public.skills where id in ('s1','s2','s3');
