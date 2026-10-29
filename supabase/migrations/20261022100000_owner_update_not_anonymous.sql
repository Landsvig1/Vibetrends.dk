-- Owner UPDATE on vibes and agents is for signed-in humans only.
--
-- 20260813000000_review_state.sql let an anonymous identity (POST
-- /api/agentauth) update its own row as long as the row stayed 'pending'.
-- Nothing in the app needs that: agents submit through insert, and edits to a
-- submission happen on the row by a maintainer before its manifest is
-- regenerated (scripts/review-queue.mjs).
--
-- The USING clause now also requires `not public.is_anonymous_caller()`, so an
-- anonymous owner's UPDATE matches no rows. WITH CHECK is unchanged.
-- skills and blog_posts have no owner UPDATE policy and are untouched.
--
-- Idempotent and reversible: drop-then-create, down path in a comment at the
-- bottom. No code dependency: no app path updates vibes or agents.

begin;

drop policy if exists "Allow owner update to showcase" on public.vibes;
create policy "Allow owner update to showcase"
  on public.vibes for update
  to authenticated
  using (auth.uid() = user_id and not public.is_anonymous_caller())
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

drop policy if exists "Allow owner update to agents" on public.agents;
create policy "Allow owner update to agents"
  on public.agents for update
  to authenticated
  using (auth.uid() = user_id and not public.is_anonymous_caller())
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

commit;

-- ---------------------------------------------------------------------------
-- DOWN
--
-- begin;
-- drop policy if exists "Allow owner update to showcase" on public.vibes;
-- create policy "Allow owner update to showcase"
--   on public.vibes for update
--   to authenticated
--   using (auth.uid() = user_id)
--   with check (
--     auth.uid() = user_id
--     and (not public.is_anonymous_caller() or review_state = 'pending')
--   );
-- drop policy if exists "Allow owner update to agents" on public.agents;
-- create policy "Allow owner update to agents"
--   on public.agents for update
--   to authenticated
--   using (auth.uid() = user_id)
--   with check (
--     auth.uid() = user_id
--     and (not public.is_anonymous_caller() or review_state = 'pending')
--   );
-- commit;
