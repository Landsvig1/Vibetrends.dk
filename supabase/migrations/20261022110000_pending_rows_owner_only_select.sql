-- Limit SELECT on the four catalog tables to approved rows, plus the caller's
-- own rows.
--
-- Until now the read policies were `using (true)` and the review gate lived
-- only in the application's read filters (visibleOnly in src/lib/reviewGate.ts).
-- This moves the same rule into RLS, so the database enforces what the read
-- filters already do.
--
-- Who still sees a pending row:
--   * its owner (auth.uid() = user_id). createSkill/createProject/createAgent/
--     createBlogPost insert with .select().single(), which needs the new row
--     to pass SELECT; the owner clause keeps that working, for anonymous
--     bearer identities too. Owner DELETE ... RETURNING on vibes/agents is
--     covered by the same clause.
--   * DATABASE_URL scripts (review-queue, refresh-skill-docs, publish-hot-
--     ranking): they connect as postgres, which bypasses RLS.
--   * SECURITY DEFINER functions (toggle_upvote and the upvote counters).
--
-- ORDERING. Every public read in src/lib/db.ts already filters to approved,
-- and src/proxy.ts filters its id lookup the same way, so this changes no
-- answer the deployed site gives. Ship the proxy filter first anyway; without
-- it a pending id still resolves to absent here, which is also correct.
--
-- forum_threads and forum_replies are left alone: their gate is off
-- (FORUM_GATE_ENABLED in src/lib/reviewGate.ts).
--
-- Idempotent and reversible: drop-then-create under the existing policy names.

begin;

drop policy if exists "Allow public read access to skills" on public.skills;
create policy "Allow public read access to skills" on public.skills
  for select to anon, authenticated
  using (review_state = 'approved' or auth.uid() = user_id);

drop policy if exists "Allow public read access to showcase" on public.vibes;
create policy "Allow public read access to showcase" on public.vibes
  for select to anon, authenticated
  using (review_state = 'approved' or auth.uid() = user_id);

drop policy if exists "Allow public read access to agents" on public.agents;
create policy "Allow public read access to agents" on public.agents
  for select to anon, authenticated
  using (review_state = 'approved' or auth.uid() = user_id);

drop policy if exists "Allow public read access to blog_posts" on public.blog_posts;
create policy "Allow public read access to blog_posts" on public.blog_posts
  for select to anon, authenticated
  using (review_state = 'approved' or auth.uid() = user_id);

commit;

-- ---------------------------------------------------------------------------
-- DOWN: restore the definitions from 20260618000000_init_schema.sql.
--
-- begin;
-- drop policy if exists "Allow public read access to skills" on public.skills;
-- create policy "Allow public read access to skills" on public.skills for select to anon, authenticated using (true);
-- drop policy if exists "Allow public read access to showcase" on public.vibes;
-- create policy "Allow public read access to showcase" on public.vibes for select to anon, authenticated using (true);
-- drop policy if exists "Allow public read access to agents" on public.agents;
-- create policy "Allow public read access to agents" on public.agents for select to anon, authenticated using (true);
-- drop policy if exists "Allow public read access to blog_posts" on public.blog_posts;
-- create policy "Allow public read access to blog_posts" on public.blog_posts for select to anon, authenticated using (true);
-- commit;
