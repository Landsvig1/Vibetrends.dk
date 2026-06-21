-- Migrate skills.category from the legacy 4-label taxonomy
-- (Prompting / Agents / Automation / Fullstack) to the skills.sh topic slugs
-- that now live as the single source of truth in src/lib/topics.ts.
--
-- The mapping is intentionally lossy — the old labels do not map 1:1 onto the
-- 8 topics. Best-fit assignments below; Fullstack is split by tag heuristic.
-- Idempotent: once values are slugs, every statement is a no-op on re-run.

-- Fullstack rows that look like Next.js work -> nextjs (run before the catch-all below).
update public.skills
set category = 'nextjs'
where category = 'Fullstack'
  and exists (
    select 1 from unnest(tags) tag where lower(tag) like '%next%'
  );

-- Remaining Fullstack -> frontend-react.
update public.skills
set category = 'frontend-react'
where category = 'Fullstack';

-- Prompting / Agents / Automation -> agent-workflows.
update public.skills
set category = 'agent-workflows'
where category in ('Prompting', 'Agents', 'Automation');

-- Safety net: any value that is not one of the 8 known slugs defaults to
-- agent-workflows so no row is left on an invalid category.
update public.skills
set category = 'agent-workflows'
where category not in (
  'frontend-react', 'nextjs', 'design-ui', 'mobile',
  'agent-workflows', 'database', 'testing', 'marketing'
);
