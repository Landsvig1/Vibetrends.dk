-- Remap the skills.category column onto vibetrends' own discipline-oriented
-- taxonomy that now lives as the single source of truth in src/lib/topics.ts.
--
-- The taxonomy moved away from the skills.sh-mirrored topic slugs to a
-- discipline/role set. Old -> new mapping:
--   frontend-react  -> front-end
--   mobile          -> front-end
--   nextjs          -> full-stack
--   testing         -> full-stack
--   design-ui       -> design
--   database        -> back-end
--   marketing       -> marketing        (unchanged)
--   agent-workflows -> agent-workflows  (unchanged)
-- New slug `webshop` has no legacy source — it starts empty and fills via the
-- submit flow.
--
-- Ordering note: the launch seed (20260620020000_seed_skills_snapshot.sql) runs
-- BEFORE this migration, so on a fresh database the seed inserts the legacy
-- slugs and this migration then rewrites them. That makes editing the
-- (explicitly temporary) seed file unnecessary — both existing and fresh DBs
-- converge to the new taxonomy here, and the seed stays the single declarative
-- snapshot it was authored to be.
--
-- Reversibility: the original value is snapshotted into category_legacy BEFORE
-- any rewrite (written once, only when null), so the move is invertible:
--   update public.skills set category = category_legacy where category_legacy is not null;
--
-- Idempotent: once values are in the new slug set the legacy predicates match
-- nothing and every statement is a no-op on re-run. category_legacy is only
-- written when null, so re-runs never overwrite the first-captured original.

-- 0. Snapshot the pre-migration category for reversibility.
alter table public.skills add column if not exists category_legacy text;
update public.skills set category_legacy = category where category_legacy is null;

-- 1. Apply the old -> new mapping. Only the six changing slugs are touched;
--    marketing and agent-workflows are intentionally absent (no-op).
update public.skills
set category = case category
  when 'frontend-react' then 'front-end'
  when 'mobile'         then 'front-end'
  when 'nextjs'         then 'full-stack'
  when 'testing'        then 'full-stack'
  when 'design-ui'      then 'design'
  when 'database'       then 'back-end'
  else category
end
where category in
  ('frontend-react', 'mobile', 'nextjs', 'testing', 'design-ui', 'database');

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Category distribution — sanity-check the split:
--   select category, count(*) as n from public.skills group by category order by n desc;
--   -- Must return 0 — no legacy slugs left on any row:
--   select count(*) from public.skills
--   where category in ('frontend-react','mobile','nextjs','testing','design-ui','database');
--   -- Must return 0 — every row has a reversibility snapshot:
--   select count(*) from public.skills where category_legacy is null;
--   -- Compare to pre-migration total — rows are recategorized, never deleted.
--   select count(*) as total_rows from public.skills;
--
-- ROLLBACK (reverses the remap using the snapshot):
--   update public.skills set category = category_legacy where category_legacy is not null;
