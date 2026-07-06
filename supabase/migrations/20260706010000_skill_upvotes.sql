-- Activate upvotes for skills, mirroring the vibes/threads/replies/agents
-- mechanism exactly:
--   * an `upvotes` counter column on skills
--   * a skill_upvotes join table (one row per user per skill)
--   * SECURITY DEFINER trigger functions that keep the counter in sync, pinned
--     to an empty search_path and with direct EXECUTE revoked (advisor-clean)
--   * RLS: public read, authenticated insert of own row, owner delete (toggle)
--   * a 'skill' kind in admin_bump_upvotes so admin multi-like covers skills
--
-- Reverse with:
--   drop trigger if exists trg_increment_skill_upvotes on public.skill_upvotes;
--   drop trigger if exists trg_decrement_skill_upvotes on public.skill_upvotes;
--   drop function if exists public.increment_skill_upvotes();
--   drop function if exists public.decrement_skill_upvotes();
--   drop table if exists public.skill_upvotes;
--   alter table public.skills drop column if exists upvotes;
--   (and re-apply 20260706000000_admin_multi_upvote.sql for the previous
--    admin_bump_upvotes body without the 'skill' branch)

-- 1. Counter column on the skills themselves.
alter table public.skills
  add column if not exists upvotes integer not null default 1;

-- 2. Join table: one upvote per (user, skill).
create table if not exists public.skill_upvotes (
  user_id uuid references auth.users(id) on delete cascade,
  skill_id text references public.skills(id) on delete cascade,
  primary key (user_id, skill_id)
);

-- 3. Counter-sync trigger functions (definer-privileged, search_path pinned).
create or replace function public.increment_skill_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.skills set upvotes = upvotes + 1 where id = new.skill_id;
  return new;
end;
$$;

create or replace function public.decrement_skill_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.skills set upvotes = upvotes - 1 where id = old.skill_id;
  return old;
end;
$$;

drop trigger if exists trg_increment_skill_upvotes on public.skill_upvotes;
create trigger trg_increment_skill_upvotes
after insert on public.skill_upvotes
for each row execute function public.increment_skill_upvotes();

drop trigger if exists trg_decrement_skill_upvotes on public.skill_upvotes;
create trigger trg_decrement_skill_upvotes
after delete on public.skill_upvotes
for each row execute function public.decrement_skill_upvotes();

revoke execute on function
  public.increment_skill_upvotes(),
  public.decrement_skill_upvotes()
from public, anon, authenticated;

-- 4. RLS (matches the other *_upvotes tables).
alter table public.skill_upvotes enable row level security;

drop policy if exists "Allow public read access to skill_upvotes" on public.skill_upvotes;
create policy "Allow public read access to skill_upvotes"
  on public.skill_upvotes for select to anon, authenticated using (true);

drop policy if exists "Allow authenticated insert to skill_upvotes" on public.skill_upvotes;
create policy "Allow authenticated insert to skill_upvotes"
  on public.skill_upvotes for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Allow owner delete to skill_upvotes" on public.skill_upvotes;
create policy "Allow owner delete to skill_upvotes"
  on public.skill_upvotes for delete to authenticated using (auth.uid() = user_id);

-- 5. Admin multi-like: add the 'skill' kind (full function body redefined;
-- see 20260706000000_admin_multi_upvote.sql for the original).
create or replace function public.admin_bump_upvotes(kind text, target_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare new_count integer;
begin
  if not public.is_admin() then
    return null;
  end if;

  if kind = 'vibe' then
    update public.vibes set upvotes = upvotes + 1
      where id = target_id returning upvotes into new_count;
  elsif kind = 'thread' then
    update public.forum_threads set upvotes = upvotes + 1
      where id = target_id returning upvotes into new_count;
  elsif kind = 'reply' then
    update public.forum_replies set upvotes = upvotes + 1
      where id = target_id returning upvotes into new_count;
  elsif kind = 'agent' then
    update public.agents set upvotes = upvotes + 1
      where id = target_id returning upvotes into new_count;
  elsif kind = 'skill' then
    update public.skills set upvotes = upvotes + 1
      where id = target_id returning upvotes into new_count;
  else
    raise exception 'unknown upvote kind: %', kind;
  end if;

  return new_count;
end;
$$;

revoke execute on function public.admin_bump_upvotes(text, text) from public, anon;
grant execute on function public.admin_bump_upvotes(text, text) to authenticated;
