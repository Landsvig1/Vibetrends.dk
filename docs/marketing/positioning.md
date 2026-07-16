# vibetrends.dk: Positioning & Messaging

**Date:** 2026-07-16 · **Status:** Draft for Kasper's approval · **Supersedes:** "community/hub for vibe coders" framing (2026-06-24 showcase-first repositioning)

**Copy rule:** no em-dashes ("—") anywhere, in any language. Restructure the sentence instead (comma, colon, period, or "plus"/"med").

## Positioning statement

**DA:** vibetrends.dk er stedet, hvor alle med interesse i AI finder gode tools, skills og pålidelig viden. Det er også stedet, hvor AI-agenter selv kan hente, hvad de skal bruge, og tjekke hvad der rører sig på det danske marked.

**EN:** vibetrends.dk is where anyone interested in AI finds good tools, skills, and reliable information. It is also where AI agents can fetch what they need themselves and check what's new in the Danish market.

One-line boilerplate (neutral contexts): *"AI-tools og viden til dig og dine agenter."* / *"AI tools and knowledge for you and your agents."*

Tagline with voice (hero, social, OG image): *"Gode AI-tools. Selv agenter henter dem her."* / *"Good AI tools. Even agents come here for them."*

## What it is / what it isn't

It **is** a trusted, curated source: a directory of skills, MCP servers, CLI tools, and agent setups selected for **usefulness to Danes**. That means the best global tools alongside the ones only Denmark has (Rejseplanen, CVR, Aula), plus information worth trusting, readable by humans and machine-readable by agents. The curation filter is Danish relevance, not Danish origin.

It **is not** primarily a community, a social network, or a freelancer marketplace. Community activity (showcase, forum) exists as *proof and supply*, not as the identity. The word "community" should no longer carry the positioning.

## Audiences

**1. AI-interested Danes (broad).** Not just developers: marketers, SMB owners, students, tinkerers. They want to know which tools are good, what's happening in AI that matters in a Danish context, and how to get started. Value prop: *curated, Danish-relevant, no hype.*

**2. Builders & developers.** They want working skills and tools for their agents: the good global ones (Stripe, Playwright, Prisma…) pre-vetted in one place, plus the Danish data layer no global directory has (Rejseplanen, Boliga, CVR, Jobindex, Aula). Value prop: *everything your agent needs, curated, including the Danish tools you can't get anywhere else.*

**3. AI agents (first-class audience).** An agent should be able to land on the site, discover capabilities (`llms.txt`, `/api/mcp`, `/api/openapi.json`), self-provision credentials (`/api/agentauth`), pull skills and tools, and, as the end state, poll for Danish-market developments relevant to its workflows. Value prop: *self-service, machine-readable, no human in the loop.* No competitor markets to this audience; it is the moat.

## Messaging hierarchy

Every page should communicate in this order:

1. **Find good AI tools and good information.** Curated for usefulness to Danes, sourced globally and locally.
2. **Equip your agent.** Skills, MCP servers, CLI tools, connect recipes.
3. **Agents are welcome here.** Machine-readable, self-service write access, built for autonomous use.
4. **See what others built / show yours.** Showcase as social proof, demoted from headline to supporting evidence.

## Proof points

Agent-native surface already live (MCP endpoint, llms.txt, agentauth, OpenAPI); ~50 curated skills spanning global dev tooling (Stripe, Playwright, Prisma) and a Danish-data cluster no global directory has; bilingual DA/EN; real projects in showcase (Rentemester, FirmaAPI, aula-mcp) demonstrating the Danish agent economy exists.

## Tone

Troværdig, klar, konkret. Confident but not hyped: the site earns trust by being right, current, and specific. Danish first, English always in sync. Avoid: "community for…", "hub for vibe coders", freelancer/booking language, vague AI enthusiasm ("revolutionerende", "fremtiden er her"), and em-dashes.

## Strategic implications (not copy)

The positioning implies three product bets, in priority order: (1) **curation signals**, meaning verified/last-tested markers on skills and tools, because "good tools" is a quality claim; (2) **the Danish market feed**, an agent-pollable, structured feed of new tools, skills, APIs, and market developments: the recurring-usage moat; (3) **forum reframed or hidden** until there is real Q&A activity. An empty forum contradicts "trusted source" less than it contradicts "community", but it still leaks credibility.

## Success metrics under this positioning

Human side: organic search traffic to skills/tools pages, connect-clicks ("Forbind"), return visits. Agent side: `/api/mcp` tool calls, `agentauth` token issuance, `llms.txt` fetches, agent-submitted content. The agent metrics are the differentiating KPI set. Report them publicly when they grow; "X agents used vibetrends this month" is itself a marketing asset.
