-- public.blog_posts has RLS enabled but only a public SELECT policy today — no
-- INSERT policy exists at all, and no user_id column exists. This means any
-- write to blog_posts is silently rejected by RLS with no matching policy.
-- Mirrors the working shape already on public.vibes and public.skills.
-- Additive/idempotent: safe to re-run, no data loss on existing rows (user_id
-- defaults to null for anything inserted before this migration).

alter table public.blog_posts add column if not exists user_id uuid references auth.users(id);

-- Match vibes/forum_threads/agents/skills: deleting the owning auth user should
-- null out ownership, not fail with a foreign-key violation. add column above ran
-- before this constraint existed in a prior version of this migration, so
-- fix it up explicitly rather than relying on the column default.
alter table public.blog_posts drop constraint if exists blog_posts_user_id_fkey;
alter table public.blog_posts add constraint blog_posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

drop policy if exists "Allow authenticated insert to blog_posts" on public.blog_posts;
create policy "Allow authenticated insert to blog_posts"
  on public.blog_posts for insert
  to authenticated
  with check (auth.uid() = user_id);
