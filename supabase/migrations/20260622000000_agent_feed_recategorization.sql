-- Recategorize the agents table onto the feed-vs-host taxonomy that now lives
-- as the single source of truth in src/lib/feedTypes.ts.
--
-- The agents.category column has historically carried four values:
--   DevTools / Writing / Browsing  -> feed-worthy "agent" listings
--   MCP Server                     -> the third-party MCP-server feed
-- and has been the ONLY feed-vs-host discriminator (enforced in TS/Zod, not at
-- the DB level). This migration rewrites it onto three values:
--   Tool CLI   -> a CLI/tool an agent invokes (a feed item)
--   MCP Server -> unchanged (already a feed type, surfaced at /mcp)
--   Host       -> a coding agent / CLI that is itself a connection target
--                 (Claude Code, Cursor, Gemini, …) — RETAINED but excluded
--                 from every catalog surface by db.ts (see getAgents).
--
-- Rule (fixed): rows whose NAME exactly matches a known coding-agent/host are
-- set to 'Host'; every other DevTools/Writing/Browsing row defaults to
-- 'Tool CLI'. Host matching uses EXACT whole-name equality (not substring
-- ilike) so a feed item like "cursor-helper" or "gemini-scraper" is never
-- mis-demoted into the never-shown Host bucket. The safe failure direction is
-- a missed host appearing as a Tool CLI (visible, recoverable) rather than a
-- real tool silently vanishing from every catalog surface.
--
-- Reversibility (R9): the original value is snapshotted into category_legacy
-- BEFORE any rewrite, so the move is invertible without data-recovery work
-- (re-run `update agents set category = category_legacy`). The per-row rewrite
-- below is lossy on its own; category_legacy is what preserves reversibility.
--
-- Idempotent: once values are in {Tool CLI, MCP Server, Host}, the
-- DevTools/Writing/Browsing predicates match nothing and every statement is a
-- no-op on re-run. category_legacy is only ever written when null, so re-runs
-- never overwrite the first-captured original.
--
-- !! MANUAL REVIEW BEFORE PRODUCTION !!
-- The host name list below was authored without access to the live agents
-- rows (the project's Supabase instance was not reachable from the authoring
-- environment). Before applying to production, confirm the host allowlist
-- against the real data and extend the exact-name list (or supply a curated id
-- list) for any coding-agent/host that is missed:
--   select id, name, developer, category from public.agents
--   where category in ('DevTools', 'Writing', 'Browsing') order by name;
-- Also spot-check MCP Server rows for any host accidentally filed there — the
-- step-1 UPDATE only inspects the three legacy categories.

-- 0. Snapshot the pre-migration category so the move is reversible (R9):
--    `update public.agents set category = category_legacy` inverts everything
--    below. Written once (only when null) so re-runs are non-destructive.
alter table public.agents add column if not exists category_legacy text;
update public.agents set category_legacy = category where category_legacy is null;

-- 1. Host-like rows: coding agents / CLIs that are connection targets, not feed
--    items. EXACT whole-name match (lower/trim) — NOT substring ilike — so a
--    feed item like "cursor-helper" or "gemini-scraper" is never swept into the
--    hidden Host bucket. Extend this list (or use a curated id list) during the
--    manual review above. Keep aligned with the HOSTS registry in feedTypes.ts.
update public.agents
set category = 'Host'
where category in ('DevTools', 'Writing', 'Browsing')
  and lower(trim(name)) in (
    'claude code', 'cursor', 'gemini', 'gemini cli', 'windsurf',
    'github copilot', 'copilot', 'cline', 'aider', 'codex',
    'continue', 'zed', 'amp', 'cody', 'devin'
  );

-- 2. Everything else still on a legacy feed category becomes a Tool CLI.
--    (Default fallback — rows here that turn out to be hosts must be moved to
--    'Host' during the manual review above.)
update public.agents
set category = 'Tool CLI'
where category in ('DevTools', 'Writing', 'Browsing');

-- 3. Safety net: any value that is not one of the three canonical feed-vs-host
--    categories defaults to 'Tool CLI' so no row is left on an invalid
--    category. (MCP Server and Host are preserved.)
update public.agents
set category = 'Tool CLI'
where category not in ('Tool CLI', 'MCP Server', 'Host');

-- 4. Index the category column: every agents list query now filters on it
--    (getAgents/getToolClis/getCounts/getTopAgents) and orders by upvotes. The
--    composite covers both the category filter and the upvotes-desc ordering.
create index if not exists agents_category_upvotes_idx
  on public.agents (category, upvotes desc);

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Category distribution — sanity-check the split:
--   select category, count(*) as n from public.agents group by category order by n desc;
--   -- Must return 0 — no legacy values left on any row:
--   select count(*) from public.agents where category in ('DevTools','Writing','Browsing');
--   -- Must return 0 — every row has a reversibility snapshot:
--   select count(*) from public.agents where category_legacy is null;
--   -- Must return 0 — nothing on a non-canonical category:
--   select count(*) from public.agents where category not in ('Tool CLI','MCP Server','Host');
--   -- Compare to the pre-migration total — rows are recategorized, never deleted.
--   select count(*) as total_rows from public.agents;
--
-- PRE-APPLY: also spot-check hosts mis-filed as MCP Server (step 1 skips them):
--   select id, name, category from public.agents
--   where category = 'MCP Server'
--     and lower(trim(name)) in (
--       'claude code','cursor','gemini','gemini cli','windsurf','github copilot',
--       'copilot','cline','aider','codex','continue','zed','amp','cody','devin'
--     );
--
-- ROLLBACK (reverses the recategorization using the snapshot):
--   update public.agents set category = category_legacy where category_legacy is not null;
