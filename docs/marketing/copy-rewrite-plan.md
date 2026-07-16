# Site copy rewrite plan: "tools & viden til dig og dine agenter"

**Date:** 2026-07-16 · **Basis:** [positioning.md](positioning.md) · **Scope:** copy only, no structural/routing changes. Translation key names stay unchanged (per KTD-1 precedent in the 2026-06-24 repositioning plan: change values, not keys).

## Principles

Lead with utility (tools + information), support with agent-readiness, close with showcase as proof. Kill remaining "community" and freelancer-era language. DA and EN stay in sync. Keep titles ≤60 chars, descriptions ≤160 chars for SERP display. **Hard rule: no em-dashes ("—") in any copy, any language.** Restructure the sentence instead.

## 1. Global metadata: `src/app/layout.tsx`

| Field | Current | New |
|---|---|---|
| title | vibetrends.dk - Hub for danske AI-byggere & Vibe Coders | vibetrends.dk: AI-tools til dig og dine agenter |
| description | Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret af hvad folk bygger — og vis dit eget. | Kuraterede AI-skills, MCP-servere og tools, udvalgt til Danmark. Mennesker er velkomne. Agenter også. |
| og:title / twitter:title | (same as title) | (same as new title) |
| og:description | Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret — og vis hvad du har bygget. | AI-tools og viden, udvalgt til Danmark. Også læsbar for agenter. |
| JSON-LD WebSite description | (community phrasing) | (same as new og:description) |

## 2. Homepage hero: `src/app/page.tsx` (hardcoded JSX, lines ~57-66)

DA: `Gode AI-tools. <span class="accent">Selv agenter</span> henter dem her.`
EN: `Good AI tools. <span class="accent">Even agents</span> come here for them.`

The claim does the work: quality first, then the differentiator as a punchline. Softer alternative, DA: `Tools til dig. <span>Og dine agenter.</span>` / EN: `Tools for you. <span>And your agents.</span>`

## 3. Translation keys: `src/lib/translations.ts`

| Key | Current DA | New DA | New EN |
|---|---|---|---|
| home.hero_desc | Bliv inspireret af hvad folk bygger med AI, og vis dit eget. Plus agent tools, MCP servere, skills og CLI-tools til dine workflows. | Skills, MCP-servere og CLI-tools der virker. Verdens bedste, plus dem kun Danmark har. Se hvad danskerne bygger med dem. | Skills, MCP servers, and CLI tools that work. The world's best, plus the ones only Denmark has. See what Danes build with them. |

Note: the headline already carries the agent self-fetch message, so the description's closing sentence gives showcase the proof role instead of repeating it.
| home.btn_showcase | Se Showcase | Se Showcase *(unchanged, now 3rd in visual order, see §5)* | See Showcase |
| home.btn_find_freelancer | Se vores tools | Udforsk tools | Explore tools |
| home.btn_submit_project | Indsend dit projekt | Indsend dit projekt *(unchanged)* | Submit your project |
| home.section.featured_skills | Community Skills | Udvalgte Skills | Featured Skills |
| home.freelancer | Vibe Coder | Bidragyder | Contributor |
| footer.desc | Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret — og vis hvad du har bygget. | AI-tools og viden, udvalgt til Danmark. For mennesker og agenter. | AI tools and knowledge, curated for Denmark. For humans and agents. |
| footer.forum | Developer Forum | Forum *(broader audience, not only developers)* | Forum |

Logo subtitle (wherever "AI Community & Tools" renders, likely the header component): → **"AI Tools & Viden"** / **"AI Tools & Knowledge"**.

## 4. Hub page metadata (static `metadata` exports per section)

| Page | New DA description |
|---|---|
| /skills | AI-skills der virker. Verdens bedste, plus dem kun Danmark har: Rejseplanen, Boliga, CVR. Din agent kan selv hente dem. |
| /vibes | Se hvad Danmark bygger med AI. Med prompts, stacks og live demos. |
| /mcp | MCP-servere, udvalgt og testet. Fra Aula og CVR til verdens bedste agent-tools. Connect-opskrift følger med. |
| /cli | CLI-tools din agent kan kalde direkte. Kuraterede og testede. |
| /forum | Spørg om AI. Få svar fra folk der bygger. |
| /agent-guide | Til agenter: læs, hent, bidrag. MCP, llms.txt og adgang på 30 sekunder via /api/agentauth. |

EN mirrors DA in each case.

## 5. Recommended (small structural nudges, flag before doing)

1. **Hero CTA order:** Tools first ("Udforsk tools" → /skills), then Showcase, then Submit. Utility now leads; showcase is proof.
2. **Fourth hero element for agents:** a low-key text link under the CTAs, DA: "Er du en AI-agent? Start her →" linking to /agent-guide. Cheap, on-positioning, and quotable. Nobody else greets agents on their homepage.
3. **Forum:** until threads exist, retitle nav/footer to "Forum" and seed 3-5 genuine Q&A threads, or demote it from the header nav. An empty "Developer Forum" undercuts the trusted-source claim.
4. **og-default.jpg:** refresh the default OG image text to the new tagline once copy ships.

## Rollout

Single copy-only PR touching `translations.ts`, `page.tsx`, `layout.tsx`, and the hub `metadata` exports; §5 items as a follow-up PR each. Verify both language modes and OG previews (opengraph.xyz) before merge. Grep the diff for "—" before merging; the em-dash rule is a hard rule.
