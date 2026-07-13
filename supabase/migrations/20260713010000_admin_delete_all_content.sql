-- Expand admin delete rights to every content table, not just forum_threads
-- (20260709000000_admin_delete_forum_thread.sql). Postgres RLS combines
-- multiple permissive policies for the same command with OR, so each of
-- these adds an admin bypass alongside the existing owner-only policy —
-- a delete succeeds when the caller is either the owner or public.is_admin()
-- (20260706000000_admin_multi_upvote.sql).
--
-- vibes, forum_replies, agents already have owner-only DELETE policies
-- (20260618000000_init_schema.sql). skills and blog_posts have never had
-- a DELETE policy at all — this migration adds their first one, admin-only,
-- since there is no owner-delete UI/flow for either today.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY, the standard
-- re-runnable pattern (Postgres has no CREATE OR REPLACE POLICY).
--
-- Reverse with:
--   drop policy if exists "Allow admin delete to vibes" on public.vibes;
--   drop policy if exists "Allow admin delete to forum_replies" on public.forum_replies;
--   drop policy if exists "Allow admin delete to agents" on public.agents;
--   drop policy if exists "Allow admin delete to skills" on public.skills;
--   drop policy if exists "Allow admin delete to blog_posts" on public.blog_posts;

drop policy if exists "Allow admin delete to vibes" on public.vibes;
create policy "Allow admin delete to vibes" on public.vibes
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "Allow admin delete to forum_replies" on public.forum_replies;
create policy "Allow admin delete to forum_replies" on public.forum_replies
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "Allow admin delete to agents" on public.agents;
create policy "Allow admin delete to agents" on public.agents
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "Allow admin delete to skills" on public.skills;
create policy "Allow admin delete to skills" on public.skills
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "Allow admin delete to blog_posts" on public.blog_posts;
create policy "Allow admin delete to blog_posts" on public.blog_posts
  for delete to authenticated
  using (public.is_admin());
