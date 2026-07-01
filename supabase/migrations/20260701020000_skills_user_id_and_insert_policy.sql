-- public.skills has RLS enabled but only a public SELECT policy today — no
-- INSERT policy exists at all, and no user_id column exists. This means
-- POST /api/skills has never been able to succeed for anyone (bot or human):
-- createSkill()'s insert is silently rejected by RLS with no matching policy.
-- Mirrors the working shape already on public.vibes
-- ("Allow authenticated insert to showcase" in 20260618000000_init_schema.sql).
-- Additive/idempotent: safe to re-run, no data loss on existing rows (user_id
-- defaults to null for anything inserted before this migration).

alter table public.skills add column if not exists user_id uuid references auth.users(id);

-- Match vibes/forum_threads/agents: deleting the owning auth user should null
-- out ownership, not fail with a foreign-key violation. add column above ran
-- before this constraint existed in a prior version of this migration, so
-- fix it up explicitly rather than relying on the column default.
alter table public.skills drop constraint if exists skills_user_id_fkey;
alter table public.skills add constraint skills_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

drop policy if exists "Allow authenticated insert to skills" on public.skills;
create policy "Allow authenticated insert to skills"
  on public.skills for insert
  to authenticated
  with check (auth.uid() = user_id);
