-- Hold agent submissions for human review before they are publicly visible.
--
-- Context: POST /api/agentauth mints an anonymous Supabase identity with no
-- signup, and that identity can write to the catalog on the next call. Before
-- this migration the row was public on the next read, which PRODUCT.md's
-- "curated, never scraped" positioning does not survive. Submissions from
-- bearer-token callers now land as review_state = 'pending' and are excluded
-- from every public read (src/lib/reviewGate.ts).
--
-- ORDERING — this migration must land AFTER the read code that tolerates it.
-- The filters in src/lib/db.ts are written against review_state = 'approved',
-- and every row here is backfilled to 'approved', so the deployed-code /
-- migrated-database matrix is safe in both orders EXCEPT one: migrating first
-- with a 'pending' default would hide rows from code that isn't filtering yet.
-- The default is therefore 'approved' (see below), and the tolerant read code
-- ships first regardless. Reversing that order took search down for ~15
-- minutes once already.
--
-- Idempotent and reversible: every statement is add-if-not-exists or
-- drop-then-create, and the down path is at the bottom of this file in a
-- comment. Nothing here tracks applied state (this project has no
-- supabase_migrations table — see AGENTS.md), so re-runs must be safe.

begin;

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
--
-- DEFAULT 'approved', deliberately, even though the feature is about holding
-- things back. The default only applies to inserts that do not name the
-- column, and every application write names it explicitly
-- (createSkill/createProject/createAgent/createBlogPost/createThread/addReply).
-- What is left is out-of-band inserts: node scripts against DATABASE_URL, the
-- Supabase dashboard, scripts/seed-e2e-fixtures.mjs. Defaulting those to
-- 'pending' would make them silently invisible — the exact failure the
-- backfill below exists to prevent, just deferred to the next person who
-- inserts a row by hand.
--
-- Fail-closed is preserved where it matters: the RLS policies in section 3
-- REJECT an anonymous insert that resolves to 'approved' rather than letting
-- it through, so the permissive default cannot become a bypass.
--
-- ADD COLUMN ... NOT NULL DEFAULT backfills existing rows in the same
-- statement, so the live catalog is 'approved' the moment this runs. The
-- explicit UPDATE afterwards is for the re-run case, where the column already
-- exists and a row could have been left in another state.

alter table public.skills         add column if not exists review_state text not null default 'approved';
alter table public.vibes          add column if not exists review_state text not null default 'approved';
alter table public.agents         add column if not exists review_state text not null default 'approved';
alter table public.blog_posts     add column if not exists review_state text not null default 'approved';
alter table public.forum_threads  add column if not exists review_state text not null default 'approved';
alter table public.forum_replies  add column if not exists review_state text not null default 'approved';

do $$
declare
  t text;
begin
  foreach t in array array[
    'skills', 'vibes', 'agents', 'blog_posts', 'forum_threads', 'forum_replies'
  ] loop
    -- Mirrors REVIEW_STATES in src/lib/reviewGate.ts — change both together.
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_review_state_check'
    );
    execute format(
      'alter table public.%I add constraint %I check (review_state in (''pending'', ''approved''))',
      t, t || '_review_state_check'
    );

    -- Partial index: every gated read adds `review_state = 'approved'`, and
    -- the pending set is small and short-lived, so index the predicate rather
    -- than the column. Also makes the review queue's own scan cheap.
    execute format(
      'create index if not exists %I on public.%I (review_state) where review_state = ''pending''',
      t || '_pending_idx', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Backfill (re-run safety; the ADD COLUMN above already covers first run)
-- ---------------------------------------------------------------------------
--
-- THE TRAP THIS AVOIDS: if the column arrived NULL-able and empty while the
-- read paths filtered on it, every row in the live catalog would fail the
-- filter and the entire site would render empty. Backfilling in the same
-- transaction as the column add is what makes that unreachable.

update public.skills        set review_state = 'approved' where review_state is distinct from 'pending' and review_state <> 'approved';
update public.vibes         set review_state = 'approved' where review_state is distinct from 'pending' and review_state <> 'approved';
update public.agents        set review_state = 'approved' where review_state is distinct from 'pending' and review_state <> 'approved';
update public.blog_posts    set review_state = 'approved' where review_state is distinct from 'pending' and review_state <> 'approved';
update public.forum_threads set review_state = 'approved' where review_state is distinct from 'pending' and review_state <> 'approved';
update public.forum_replies set review_state = 'approved' where review_state is distinct from 'pending' and review_state <> 'approved';

-- ---------------------------------------------------------------------------
-- 3. RLS backstop
-- ---------------------------------------------------------------------------
--
-- WHY THIS IS NOT OPTIONAL. The review gate in src/lib/db.ts runs inside our
-- route handlers, and an agent is not obliged to use them. It holds a real
-- Supabase access token, the anon key is public by design (it ships in the
-- client bundle), and RLS on these tables is `WITH CHECK (auth.uid() =
-- user_id)` — nothing about the state column. So the agent can POST straight
-- to <project>.supabase.co/rest/v1/skills and insert review_state =
-- 'approved', skipping the gate entirely. On vibes and agents it can also
-- UPDATE its own pending row to 'approved' afterwards, because those carry an
-- owner-update policy. A gate only enforced in application code is not a gate.
--
-- WHAT THE DATABASE CAN ACTUALLY SEE. The application distinguishes callers by
-- transport: `actingAs` is set iff the request carried an Authorization:
-- Bearer header (resolveRequestIdentity in src/lib/supabase-server.ts). The
-- database cannot see a header. What it can see is the `is_anonymous` claim in
-- the JWT, which is true exactly for the identities /api/agentauth mints.
--
-- The two boundaries therefore differ, and the narrower one is the DB's:
--   - application: ALL bearer callers are held, including a human running a
--     script with their own session token.
--   - database:    ONLY anonymous identities are forced to 'pending'.
--
-- That is sound rather than a gap. The application gate is the product rule
-- and is strictly stronger. The RLS policy is the backstop against the one
-- caller who can bypass the application entirely, and every such caller today
-- is anonymous, because an unattended agent has no other way to get a token
-- without a human clearing a magic link.

create or replace function public.is_anonymous_caller()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

comment on function public.is_anonymous_caller() is
  'True when the current JWT belongs to an anonymous identity (POST /api/agentauth). Used by the review-state RLS backstop; see 20260813000000_review_state.sql.';

-- INSERT: an anonymous identity may only create pending rows.
-- Applied to the four CATALOG tables only. forum_threads/forum_replies are
-- deliberately excluded: their gate ships off (FORUM_GATE_ENABLED in
-- src/lib/reviewGate.ts), so createThread/addReply write 'approved', and a
-- policy forcing 'pending' would reject every agent forum write outright.
-- Turning the forum gate on later is a one-line code change plus the two
-- commented statements at the end of this section.

drop policy if exists "Allow authenticated insert to skills" on public.skills;
create policy "Allow authenticated insert to skills"
  on public.skills for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

drop policy if exists "Allow authenticated insert to showcase" on public.vibes;
create policy "Allow authenticated insert to showcase"
  on public.vibes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

drop policy if exists "Allow authenticated insert to agents" on public.agents;
create policy "Allow authenticated insert to agents"
  on public.agents for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

drop policy if exists "Allow authenticated insert to blog_posts" on public.blog_posts;
create policy "Allow authenticated insert to blog_posts"
  on public.blog_posts for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

-- UPDATE: close the self-approval path. Only vibes and agents carry an
-- owner-update policy among the gated four (skills and blog_posts have none,
-- so their rows are already immutable to the submitter). Without this, an
-- agent inserts 'pending' as required and then flips its own row to
-- 'approved' one request later.

drop policy if exists "Allow owner update to showcase" on public.vibes;
create policy "Allow owner update to showcase"
  on public.vibes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

drop policy if exists "Allow owner update to agents" on public.agents;
create policy "Allow owner update to agents"
  on public.agents for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (not public.is_anonymous_caller() or review_state = 'pending')
  );

-- When FORUM_GATE_ENABLED flips to true in src/lib/reviewGate.ts, add the
-- matching backstop by uncommenting these. Kept here rather than in a future
-- file so the two halves of that decision stay in one place:
--
-- drop policy if exists "Allow authenticated insert to forum_threads" on public.forum_threads;
-- create policy "Allow authenticated insert to forum_threads"
--   on public.forum_threads for insert to authenticated
--   with check (auth.uid() = user_id and (not public.is_anonymous_caller() or review_state = 'pending'));
--
-- drop policy if exists "Allow authenticated insert to forum_replies" on public.forum_replies;
-- create policy "Allow authenticated insert to forum_replies"
--   on public.forum_replies for insert to authenticated
--   with check (auth.uid() = user_id and (not public.is_anonymous_caller() or review_state = 'pending'));

commit;

-- ---------------------------------------------------------------------------
-- DOWN (manual — nothing tracks applied state here)
-- ---------------------------------------------------------------------------
-- Restore the pre-review policies, then drop the column. Order matters: the
-- policies reference review_state, so they must be replaced before the drop.
--
-- begin;
-- drop policy if exists "Allow authenticated insert to skills" on public.skills;
-- create policy "Allow authenticated insert to skills" on public.skills for insert to authenticated with check (auth.uid() = user_id);
-- drop policy if exists "Allow authenticated insert to showcase" on public.vibes;
-- create policy "Allow authenticated insert to showcase" on public.vibes for insert to authenticated with check (auth.uid() = user_id);
-- drop policy if exists "Allow authenticated insert to agents" on public.agents;
-- create policy "Allow authenticated insert to agents" on public.agents for insert to authenticated with check (auth.uid() = user_id);
-- drop policy if exists "Allow authenticated insert to blog_posts" on public.blog_posts;
-- create policy "Allow authenticated insert to blog_posts" on public.blog_posts for insert to authenticated with check (auth.uid() = user_id);
-- drop policy if exists "Allow owner update to showcase" on public.vibes;
-- create policy "Allow owner update to showcase" on public.vibes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- drop policy if exists "Allow owner update to agents" on public.agents;
-- create policy "Allow owner update to agents" on public.agents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter table public.skills        drop column if exists review_state;
-- alter table public.vibes         drop column if exists review_state;
-- alter table public.agents        drop column if exists review_state;
-- alter table public.blog_posts    drop column if exists review_state;
-- alter table public.forum_threads drop column if exists review_state;
-- alter table public.forum_replies drop column if exists review_state;
-- drop function if exists public.is_anonymous_caller();
-- commit;
