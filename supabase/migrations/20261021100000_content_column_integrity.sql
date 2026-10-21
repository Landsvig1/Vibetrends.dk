-- Keep server-owned columns on the six content tables out of API callers' hands.
--
-- The INSERT/UPDATE policies on skills, vibes, agents, blog_posts,
-- forum_threads and forum_replies only check auth.uid() = user_id, so a caller
-- writing through PostgREST chose every other column itself. This trigger
-- pins the columns the app treats as server-owned:
--
--   INSERT  upvotes reset to the column default, created_at to now() (where
--           the table has them). Anonymous callers get the author name
--           'agent_' || first 8 chars of auth.uid(), whatever they sent.
--           Other callers keep the author they sent, except a reserved name
--           (trimmed, case-insensitive) raises 22023 'reserved_author' unless
--           the caller is an admin or the curator bot.
--   UPDATE  upvotes, created_at, user_id and the author column are kept from
--           the old row.
--
-- Mirrored in the app by src/lib/reservedNames.ts and deriveUsername in
-- src/lib/supabase-server.ts. Change the reserved list in both places.
--
-- Scope: the trigger only fires when current_user is anon or authenticated,
-- i.e. a PostgREST caller. The WHEN clause is evaluated before the function
-- is entered, so it sees the caller's role, not the definer's. Anything that
-- runs as the table owner is untouched: the SECURITY DEFINER upvote counter
-- triggers (they UPDATE the parent row's upvotes), toggle_upvote,
-- admin_bump_upvotes, the service role, and DATABASE_URL scripts.
--
-- Idempotent and reversible: create or replace plus drop-then-create
-- triggers, down path in a comment at the bottom. Apply after the app code
-- that maps 'reserved_author' to a 400 has deployed.

begin;

create or replace function public.guard_content_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_col constant text := case tg_table_name
    when 'skills' then 'vibe_coder'
    when 'agents' then 'developer'
    else 'author'
  end;
  -- Column defaults, kept in sync by hand: skills, vibes, agents and
  -- forum_threads default to 1 (the author's own vote), forum_replies to 0.
  upvotes_default constant integer := case tg_table_name
    when 'forum_replies' then 0
    else 1
  end;
  new_row constant jsonb := to_jsonb(new);
  patch jsonb := '{}'::jsonb;
  author_name text;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into patch
    from jsonb_each(to_jsonb(old))
    where key in ('upvotes', 'created_at', 'user_id', author_col);
    return jsonb_populate_record(new, patch);
  end if;

  if new_row ? 'upvotes' then
    patch := patch || jsonb_build_object('upvotes', upvotes_default);
  end if;
  if new_row ? 'created_at' then
    patch := patch || jsonb_build_object('created_at', now());
  end if;

  if public.is_anonymous_caller() then
    patch := patch || jsonb_build_object(author_col, 'agent_' || left(auth.uid()::text, 8));
  else
    -- Same whitespace set as String.prototype.trim in the app.
    author_name := lower(regexp_replace(
      new_row ->> author_col,
      '^[\s   -     　﻿]+|[\s   -     　﻿]+$',
      '', 'g'));
    if author_name = any (array[
      'landsvig1', 'kasper', 'kasperlandsvig', 'kasper_landsvig',
      'admin', 'administrator', 'moderator',
      'vibetrends', 'vibetrends_dk', 'vibes-bot', 'vibes_bot', 'system',
      'vibetrends bot' -- the curator bot's display name on existing rows
    ])
    and not public.is_admin()
    and auth.uid() is distinct from 'fa9d9c1d-b101-4813-b6e4-8e886bbdc41e'::uuid -- curator bot (BOT_ACCOUNT_EMAIL)
    then
      raise exception 'reserved_author' using errcode = '22023';
    end if;
  end if;

  return jsonb_populate_record(new, patch);
end;
$$;

revoke execute on function public.guard_content_row() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'skills', 'vibes', 'agents', 'blog_posts', 'forum_threads', 'forum_replies'
  ] loop
    execute format('drop trigger if exists guard_content_row on public.%I', t);
    execute format(
      'create trigger guard_content_row before insert or update on public.%I '
      'for each row when (current_user in (''anon'', ''authenticated'')) '
      'execute function public.guard_content_row()',
      t
    );
  end loop;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- DOWN
--
-- begin;
-- drop trigger if exists guard_content_row on public.skills;
-- drop trigger if exists guard_content_row on public.vibes;
-- drop trigger if exists guard_content_row on public.agents;
-- drop trigger if exists guard_content_row on public.blog_posts;
-- drop trigger if exists guard_content_row on public.forum_threads;
-- drop trigger if exists guard_content_row on public.forum_replies;
-- drop function if exists public.guard_content_row();
-- commit;
