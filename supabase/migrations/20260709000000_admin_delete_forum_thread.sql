-- Let admins delete any forum thread, not just their own.
--
-- "Allow owner delete to forum_threads" (20260618000000_init_schema.sql)
-- restricts DELETE to auth.uid() = user_id. This adds a second permissive
-- policy for the same command; Postgres RLS combines multiple permissive
-- policies with OR, so a delete succeeds when the caller is either the
-- owner or an admin per public.is_admin() (20260706000000_admin_multi_upvote.sql).
--
-- No application code change needed: deleteThread() in src/lib/db.ts already
-- issues the delete through the caller's authenticated session and relies
-- entirely on RLS to gate it.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY — Postgres has no
-- CREATE POLICY IF NOT EXISTS / CREATE OR REPLACE POLICY, so this is the
-- standard re-runnable pattern.
--
-- Reverse with:
--   drop policy if exists "Allow admin delete to forum_threads" on public.forum_threads;

drop policy if exists "Allow admin delete to forum_threads" on public.forum_threads;

create policy "Allow admin delete to forum_threads" on public.forum_threads
  for delete to authenticated
  using (public.is_admin());
