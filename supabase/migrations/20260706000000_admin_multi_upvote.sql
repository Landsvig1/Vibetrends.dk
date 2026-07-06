-- Admin multi-upvote: designated admin accounts can bump any upvote counter
-- repeatedly, bypassing the one-per-user toggle join tables.
--
-- Admins are identified by identity claims rather than a seeded table so the
-- GitHub account is covered automatically the first time it logs in:
--   * email = kasper@landsvig.com (Google login, exists today)
--   * raw_user_meta_data->>'user_name' = 'landsvig1' (GitHub login, future)
--
-- Reverse with:
--   drop function if exists public.admin_bump_upvotes(text, text);
--   drop function if exists public.is_admin();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and (u.email = 'kasper@landsvig.com'
           or u.raw_user_meta_data->>'user_name' = 'landsvig1')
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Increments the upvote counter for one entity and returns the new count.
-- Returns null when the caller is not an admin (callers fall back to the
-- normal toggle path) or when the target row does not exist.
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
  else
    raise exception 'unknown upvote kind: %', kind;
  end if;

  return new_count;
end;
$$;

revoke execute on function public.admin_bump_upvotes(text, text) from public, anon;
grant execute on function public.admin_bump_upvotes(text, text) to authenticated;
