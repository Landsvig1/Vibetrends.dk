-- Rename the feed-type category value 'Tool CLI' -> 'CLI' to match the shorter,
-- MCP-style naming used across the UI, routes (/cli), API (/api/cli) and the
-- MCP read tools (search_cli). Companion to the feed-vs-host recategorization
-- in 20260622000000.
--
-- Idempotent: once values are 'CLI', the predicate matches nothing on re-run.
-- category_legacy is intentionally left untouched — it holds the ORIGINAL
-- pre-feed-taxonomy value (e.g. 'DevTools') for reversibility and is not part
-- of this cosmetic rename.

update public.agents
set category = 'CLI'
where category = 'Tool CLI';

-- Verification (run manually after applying):
--   select category, count(*) from public.agents group by category order by 1;
--   -- expect no 'Tool CLI' rows; the prior Tool CLI rows now read 'CLI'.
