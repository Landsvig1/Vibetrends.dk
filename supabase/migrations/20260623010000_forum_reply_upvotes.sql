-- Add upvotes to forum replies (comment voting), mirroring the existing
-- thread/project/agent upvote mechanism exactly:
--   * a `upvotes` counter column on forum_replies
--   * a reply_upvotes join table (one row per user per reply)
--   * SECURITY DEFINER trigger functions that keep the counter in sync, pinned
--     to an empty search_path and with direct EXECUTE revoked (advisor-clean)
--   * RLS: public read, authenticated insert of own row, owner delete (toggle)
-- The app inserts into reply_upvotes; a unique-violation (23505) means the user
-- already voted, so it deletes (toggle-off) — identical to upvoteThread.

-- 1. Counter column on the replies themselves.
alter table public.forum_replies
  add column if not exists upvotes integer not null default 0;

-- 2. Join table: one upvote per (user, reply).
create table if not exists public.reply_upvotes (
  user_id uuid references auth.users(id) on delete cascade,
  reply_id text references public.forum_replies(id) on delete cascade,
  primary key (user_id, reply_id)
);

-- 3. Counter-sync trigger functions (definer-privileged, search_path pinned).
create or replace function public.increment_reply_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_replies set upvotes = upvotes + 1 where id = new.reply_id;
  return new;
end;
$$;

create or replace function public.decrement_reply_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_replies set upvotes = upvotes - 1 where id = old.reply_id;
  return old;
end;
$$;

drop trigger if exists trg_increment_reply_upvotes on public.reply_upvotes;
create trigger trg_increment_reply_upvotes
after insert on public.reply_upvotes
for each row execute function public.increment_reply_upvotes();

drop trigger if exists trg_decrement_reply_upvotes on public.reply_upvotes;
create trigger trg_decrement_reply_upvotes
after delete on public.reply_upvotes
for each row execute function public.decrement_reply_upvotes();

-- Triggers fire the functions without caller EXECUTE; revoke direct access.
revoke execute on function public.increment_reply_upvotes() from public, anon, authenticated;
revoke execute on function public.decrement_reply_upvotes() from public, anon, authenticated;

-- 4. RLS — same shape as thread_upvotes.
alter table public.reply_upvotes enable row level security;

create policy "Allow public read access to reply_upvotes"
  on public.reply_upvotes for select to anon, authenticated using (true);
create policy "Allow authenticated insert to reply_upvotes"
  on public.reply_upvotes for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow owner delete to reply_upvotes"
  on public.reply_upvotes for delete to authenticated using (auth.uid() = user_id);
