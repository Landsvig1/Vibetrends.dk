-- public.skills has RLS enabled but only a public SELECT policy today — no
-- INSERT policy exists at all, and no user_id column exists. This means
-- POST /api/skills has never been able to succeed for anyone (bot or human):
-- createSkill()'s insert is silently rejected by RLS with no matching policy.
-- Mirrors the working shape already on public.vibes
-- ("Allow authenticated insert to showcase" in 20260618000000_init_schema.sql).
-- Additive/idempotent: safe to re-run, no data loss on existing rows (user_id
-- defaults to null for anything inserted before this migration).

alter table public.skills add column if not exists user_id uuid references auth.users(id);

drop policy if exists "Allow authenticated insert to skills" on public.skills;
create policy "Allow authenticated insert to skills"
  on public.skills for insert
  to authenticated
  with check (auth.uid() = user_id);
