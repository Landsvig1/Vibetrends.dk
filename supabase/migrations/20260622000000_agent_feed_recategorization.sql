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
-- Rule (fixed): rows whose NAME matches a known coding-agent/host are set to
-- 'Host'; every other DevTools/Writing/Browsing row defaults to 'Tool CLI'.
-- This is intentionally lossy. The mapping is reversible: re-running
-- classification (or moving a row back to a feed category) re-promotes it, so
-- the demotion needs no data-recovery work (R9).
--
-- Idempotent: once values are in {Tool CLI, MCP Server, Host}, the
-- DevTools/Writing/Browsing predicates match nothing and every statement is a
-- no-op on re-run.
--
-- !! MANUAL REVIEW BEFORE PRODUCTION !!
-- The host name list below was authored without access to the live agents
-- rows (the project's Supabase instance was not reachable from the authoring
-- environment). Before applying to production, confirm the host allowlist
-- against the real data:
--   select id, name, developer, category from public.agents
--   where category in ('DevTools', 'Writing', 'Browsing') order by name;
-- Add any coding-agent/host names that are missed, and move any false-positive
-- Tool CLI rows that are actually hosts.

-- 1. Host-like rows: coding agents / CLIs that are connection targets, not
--    feed items. Matched case-insensitively by name. Keep this list aligned
--    with the HOSTS registry in src/lib/feedTypes.ts plus the broader set of
--    coding agents users may have submitted.
update public.agents
set category = 'Host'
where category in ('DevTools', 'Writing', 'Browsing')
  and (
    name ilike '%claude code%'
    or name ilike '%cursor%'
    or name ilike '%gemini%'
    or name ilike '%windsurf%'
    or name ilike '%github copilot%'
    or name ilike '%copilot%'
    or name ilike '%cline%'
    or name ilike '%aider%'
    or name ilike '%codex%'
    or name ilike '%continue%'
    or name ilike '%zed%'
    or name ilike '%cody%'
    or name ilike '%amp%'
    or name ilike '%devin%'
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
