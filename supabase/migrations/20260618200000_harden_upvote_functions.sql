-- Harden the SECURITY DEFINER upvote trigger functions (Supabase advisor warnings):
--   1. Pin search_path = '' so the definer-privileged body can't be hijacked via a
--      caller-controlled search_path. All object references are schema-qualified.
--   2. Revoke direct EXECUTE from public/anon/authenticated. Triggers still fire
--      them (the trigger mechanism doesn't require caller EXECUTE), but no role can
--      call them directly.

create or replace function public.increment_project_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.vibes set upvotes = upvotes + 1 where id = new.project_id;
  return new;
end;
$$;

create or replace function public.decrement_project_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.vibes set upvotes = upvotes - 1 where id = old.project_id;
  return old;
end;
$$;

create or replace function public.increment_thread_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_threads set upvotes = upvotes + 1 where id = new.thread_id;
  return new;
end;
$$;

create or replace function public.decrement_thread_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_threads set upvotes = upvotes - 1 where id = old.thread_id;
  return old;
end;
$$;

create or replace function public.increment_agent_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.agents set upvotes = upvotes + 1 where id = new.agent_id;
  return new;
end;
$$;

create or replace function public.decrement_agent_upvotes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.agents set upvotes = upvotes - 1 where id = old.agent_id;
  return old;
end;
$$;

revoke execute on function
  public.increment_project_upvotes(),
  public.decrement_project_upvotes(),
  public.increment_thread_upvotes(),
  public.decrement_thread_upvotes(),
  public.increment_agent_upvotes(),
  public.decrement_agent_upvotes()
from public, anon, authenticated;

-- rls_auto_enable is an event-trigger function (auto-enables RLS on new public
-- tables). It must never be called directly. Guarded so this migration is safe
-- on a fresh database where the function may not exist.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
