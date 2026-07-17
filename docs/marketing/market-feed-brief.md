# Product brief: Det danske AI-markedsfeed

**Date:** 2026-07-16 · **Status:** Concept for Kasper's approval · **Basis:** positioning.md ("check what's new in the Danish market" as the recurring-usage moat)

## The idea in one paragraph

A structured, agent-pollable feed of what's new in AI with Danish relevance: new skills, MCP servers, CLI tools, and showcase projects on vibetrends.dk, plus editorial items (new Danish APIs like FirmaAPI, relevant regulation, model releases that matter here). An agent polls it on a schedule and asks "anything new since Tuesday that helps my workflows?" A human reads the same feed as a "Hvad er nyt" page or weekly digest. No global directory will ever do this for Denmark, and no Danish site does it for agents.

## Why this is the moat

Directories get visited once per need. Feeds get visited on a schedule. The positioning promises agents can "tjekke hvad der rører sig på det danske marked", and this is the feature that makes that promise real. It also solves the content-engine problem: the weekly digest (LinkedIn + newsletter) is generated from feed items, so one editorial effort feeds three channels (agents, site visitors, social).

## Surfaces

One data source, four outputs. **For agents:** an MCP tool `get_market_updates(since, categories)` on the existing `/api/mcp` endpoint, and `GET /api/feed?since=...&type=...` on REST, both documented in llms.txt. **For humans:** a `/nyt` page rendering the same items, bilingual as always. **For subscribers:** RSS/Atom at `/feed.xml`, which also serves newsletter tooling.

## Data model sketch

A `feed_items` table: id, type (`skill | mcp | cli | vibe | news`), title and summary in `_da`/`_en` columns per house convention, url, source, tags, published_at. Two supply routes: automatic (every approved skill/MCP/CLI/vibe submission creates a feed item, zero ongoing effort) and editorial (news items written by you or submitted by agents through the existing write path, honeypot and rate limits included).

## Phasing

**MVP (small):** auto-generate feed items from the existing content tables, ship `/api/feed`, the MCP tool, `/feed.xml`, and llms.txt documentation. No new editorial workflow, no new page. Agents can poll from day one.

**Phase 2:** the `/nyt` page, editorial news items, and the weekly "Ugens Vibes / Nyt fra det danske AI-marked" digest generated from feed items and posted to LinkedIn + newsletter.

**Phase 3:** subscriptions. Agents register a webhook or the feed supports long-poll, so "check the Danish market" becomes push instead of pull. Marketing story: the first market feed built for agents as subscribers.

## Metrics

Distinct agent tokens polling per week, poll frequency per token, RSS subscribers, digest click-through to detail pages. The headline stat to publish once it moves: "X agenter tjekker det danske AI-marked via vibetrends.dk hver uge."

## Open questions for Kasper

Whether editorial curation of `news` items is a job you want weekly (it is the differentiating content, but it is recurring work); whether `/nyt` should wait for Phase 2 or ship with MVP; and whether the digest goes out under the vibetrends brand or your personal LinkedIn (personal typically gets 5-10x reach at this stage).
