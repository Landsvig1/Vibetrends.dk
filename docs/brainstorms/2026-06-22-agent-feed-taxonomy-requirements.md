---
date: 2026-06-22
topic: agent-feed-taxonomy
title: "Recast Agents as an agent-feed: demote the section, organize by feed-vs-host"
---

# Recast Agents as an agent-feed

## Summary

Recast vibetrends from a directory that *lists* agents into a curated feed that *plugs capabilities into* an agent. The catalog holds things you attach to a coding tool — skills, MCP servers, tool-CLIs — while the coding agents themselves (Claude Code, Cursor, Gemini) become connection targets, not listings. The Agents section is demoted out of primary navigation; feed-worthy entries are salvaged into the feed types and the underlying data is retained, so the move is reversible.

---

## Problem Frame

vibetrends launched with several content sections (skills, showcase, forum, agents, MCP servers, blog). Skills has a clear job: there are hundreds of thousands, so the value is curation — surface the 0.1% worth using.

Agents has no equivalent job. There are few of them, and the category boundary is an argument rather than a fact: is Claude Code an agent? A Gemini CLI running skills? A single system prompt? An MCP server? A section whose membership is contestable feels arbitrary, costs ongoing maintenance, and re-raises the "is this an agent?" question every time something is added. The Agents and third-party MCP-server listings already share one data model, which compounds the strain.

Underneath the keep/scrap question is a different intent: the goal isn't a browsable agent directory, it's for a user to take something curated here and get it into their own coding tool to make it more capable. A Danish community cannot win on volume against skills.sh; connectability of curated content is the edge that is actually defensible.

---

## Key Decisions

- **Organize by feed vs host.** The catalog axis is "can I attach this to my agent?", not "what kind of thing is it." Feed = capabilities you attach (skills, MCP servers, tool-CLIs). Host = the agent itself (Claude Code, Cursor, Gemini). This dissolves the contested-boundary problem and stays answerable as the agent landscape churns.
- **Demote, don't delete.** Remove Agents from primary navigation, recategorize feed-worthy entries into the feed types, retain the underlying data. Reversal is cheap if real demand for agent discovery appears — search misses, submissions, and requests are the signal.
- **Hosts are connection targets, not catalog items.** Claude Code / Cursor / Gemini appear as where feed items land, never as things to browse.
- **Compete on connectability, not volume.** Positioning bet against skills.sh: curated *and* feedable beats broad.
- **Two MCP roles, both kept, not conflated.** vibetrends' own connectable surface (an agent pulls the curated catalog) is distinct from the catalog of third-party MCP servers (feed content). The demotion touches neither — it removes only the Agents listing.
- **Connectability is the requirement; the mechanism is deferred.** The product commits to "every feed item is one step from a supported host." Whether that is a documented JSON API plus `llms.txt`, a published "find-vibetrends" skill, an MCP server, or a combination is a planning decision. vibetrends already exposes JSON endpoints and agent-discovery files, so data *access* is largely solved; the open work is frictionless one-step *connection*.

---

## Requirements

**Taxonomy & navigation**
- R1. Primary navigation presents the feed types (skills, MCP servers, tool-CLIs) and does not present "Agents" as a top-level section.
- R2. A catalog item qualifies only by the feed test — it is something a user attaches to a coding agent to extend it. Coding agents/hosts themselves are not catalog items.
- R3. Existing Agents data is triaged: feed-worthy entries (tool-CLIs, MCP-capable tools, mis-filed items) are recategorized into a feed type; host-like entries are removed from the catalog surface. Underlying rows are retained, not destroyed.
- R4. Tool-CLIs exist as a feed type, distinct from skills and from MCP servers.

**Connection**
- R5. Every feed item exposes a one-step connect action that gets it into a supported host.
- R6. Supported hosts — at minimum Claude Code, Cursor, and Gemini CLI — are represented as connection targets, not as catalog listings.
- R7. An agent can obtain the curated catalog programmatically with near-zero friction. This is vibetrends' own connectable surface; the mechanism is deferred (see Outstanding Questions).

**MCP handling**
- R8. The third-party MCP-servers catalog remains as feed content under the feed model, reframed from "browse list of servers" to "MCP capabilities one step from your setup."

**Reversibility**
- R9. The demotion is reversible without data-recovery work: re-promoting Agents (or a successor) requires navigation and classification changes only, because the data is retained.

---

## Acceptance Examples

- AE1. Covers R2. Given Claude Code, when classifying it for the catalog, then it is treated as a host / connection target and not added as a catalog item. Given a scraper tool-CLI an agent invokes, when classifying it, then it is added as a feed item under the tool-CLI type.
- AE2. Covers R3, R9. Given a feed-worthy Agents entry, when the section is demoted, then the entry appears under its feed type with its data unchanged. Given a host-like Agents entry, when demoted, then it no longer appears in the catalog but its row is retained.
- AE3. Covers R5, R6. Given a skill on a feed page, when the user chooses a host such as Claude Code, then they get a one-step way to add it to that host.

---

## Scope Boundaries

**Deferred for later**
- The own-signal Hot/Trending engine (separate roadmap item).
- Broadening the topic-hub treatment to showcase, forum, and blog.
- The exact connect mechanism (documented API + `llms.txt` vs. published skill vs. MCP server) — a planning decision, not a product question.

**Outside this product's identity**
- A browsable directory of coding agents/CLIs as destinations ("which agent should I use") — a host-comparison job vibetrends does not own.
- Competing on catalog volume — vibetrends is curation plus connectability, not breadth.

---

## Dependencies / Assumptions

- Assumes vibetrends' existing JSON API (`src/app/api/*`) and agent-discovery files (`public/ai.txt`, `public/llm-ld.json`, `public/semantic-index.json`, `public/capability.json`, `public/agent-permissions.json`) remain the basis for agent data access. Extraction is therefore largely solved; the open work is one-step connection UX, not raw access.
- Assumes the current data model mixes feed-worthy and host-like entries (the agents table carries categories DevTools / Writing / Browsing plus MCP Server). R3 triage depends on reviewing those rows.

---

## Outstanding Questions

**Deferred to Planning**
- Which connect mechanism(s) to build first — documented API + `llms.txt`, a published "find-vibetrends" skill, an MCP server, or a combination — and which hosts to support beyond Claude Code / Cursor / Gemini.
- Exact recategorization rules for existing Agents rows (what counts as a tool-CLI vs. a host), and whether tool-CLIs get their own page or fold into an existing surface.
- Whether MCP servers and tool-CLIs are separate top-level sections or filters within one unified feed (information-architecture detail).

---

## Sources / Research

- Current sections and data model: `src/lib/db.ts` (agents table with categories DevTools / Writing / Browsing / MCP Server; MCP servers surfaced at `/mcp`, excluded from `/agents`), `src/app/agents/`, `src/app/mcp/`.
- Existing agent-native surface: `src/app/api/mcp/route.ts` (read-only MCP tools `search_skills` / `list_topics`), `src/app/api/*/route.ts` (JSON REST), and the `public/` agent-discovery files listed under Dependencies.
- skills.sh is the volume incumbent vibetrends positions against — the bet is curation + connectability, not breadth.
