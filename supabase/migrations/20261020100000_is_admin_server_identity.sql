-- Tie public.is_admin() to a server-owned identity.
--
-- Before this migration the function matched on the account's email or on
-- raw_user_meta_data->>'user_name'. User metadata is set by the client, and
-- whether an email change lands in auth.users.email depends on Auth settings,
-- so neither is a stable admin key. auth.uid() comes from the verified JWT and
-- the auth.users.id it names is assigned by Supabase Auth, so the admin list
-- is now a hardcoded set of user ids.
--
-- Mirrored for display in src/lib/permissions.ts (ADMIN_USER_IDS). To add or
-- remove an admin, change both and re-run this migration.
--
-- Idempotent and reversible: create or replace plus re-asserted grants, down
-- path in a comment at the bottom. No code depends on the new definition, so
-- it can be applied before or after the matching code deploys.

begin;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.uid() = any (array[
    '6d158da1-84e7-4c3a-8687-89167b16ceae'::uuid -- kasper@landsvig.com
  ]), false);
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- DOWN: restore the definition from 20260706000000_admin_multi_upvote.sql.
--
-- begin;
-- create or replace function public.is_admin()
-- returns boolean language sql stable security definer set search_path = '' as $$
--   select exists (
--     select 1 from auth.users u
--     where u.id = auth.uid()
--       and (u.email = 'kasper@landsvig.com'
--            or u.raw_user_meta_data->>'user_name' = 'landsvig1')
--   );
-- $$;
-- revoke execute on function public.is_admin() from public, anon;
-- grant execute on function public.is_admin() to authenticated;
-- commit;
