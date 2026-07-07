---
title: "feat: SEO and structured data coverage improvements"
date: 2026-06-24
type: feat
depth: standard
status: ready
---

# feat: SEO and structured data coverage improvements

**Summary:** Three concrete SEO gaps exist today: five hub pages fall back to the global layout metadata (Google sees the same title/description for showcase, forum, agents, mcp, and cli); three detail page types (mcp/[id], cli/[id], forum/[id]) are missing JSON-LD structured data; and no page emits BreadcrumbList, which unlocks breadcrumb rich results in search. Sitemap priorities are also flat, giving no signal about content hierarchy. This plan closes all four gaps.

---

## Problem Frame

The SEO infrastructure is well-built — `entityMetadata`, `jsonLd.ts` helpers, a comprehensive sitemap, and JSON-LD on most detail pages are already in place. The remaining gaps are:

1. **Hub pages with no page-specific metadata.** `/showcase`, `/forum`, `/agents`, `/mcp`, and `/cli` all fall back to the global WebSite metadata. Crawlers can't distinguish them. `/blog` already has `generateMetadata` and is fine.
2. **Incomplete detail page JSON-LD coverage.** `mcp/[id]` and `cli/[id]` have `entityMetadata` but no structured data. `forum/[id]` has `entityMetadata` but no schema for discussion content. Their equivalents (`agents/[id]`, `blog/[id]`, `showcase/[id]`) all have JSON-LD.
3. **No BreadcrumbList anywhere.** All detail pages could emit a two-level breadcrumb that unlocks a rich result in Google SERPs.
4. **Flat sitemap priorities.** All detail entries sit at 0.6. Showcase items and blog posts should be elevated to signal their higher content value.

---

## Requirements

- R1: Hub pages (showcase, forum, agents, mcp, cli) export page-specific static `metadata` with title, description, canonical path, OG, and Twitter fields.
- R2: `jsonLd.ts` gains a `breadcrumbJsonLd` helper that emits a valid `BreadcrumbList`.
- R3: `jsonLd.ts` gains a `forumThreadJsonLd` helper that emits a `DiscussionForumPosting`.
- R4: `mcp/[id]` and `cli/[id]` detail pages emit `SoftwareApplication` JSON-LD (reusing the existing `softwareAppJsonLd` helper).
- R5: `forum/[id]` detail pages emit `DiscussionForumPosting` JSON-LD (new helper from R3).
- R6: All detail pages emit a `BreadcrumbList` JSON-LD block (new helper from R2).
- R7: Sitemap elevates showcase and blog post detail entries to priority 0.7; all others stay at 0.6.

---

## Key Technical Decisions

**KTD-1: Hub pages use `export const metadata` (static), not `generateMetadata`.**
The descriptions are editorially fixed, not data-driven. Static export is simpler and ensures metadata is available without a DB call. Exception: `blog/page.tsx` already uses `generateMetadata` for fetching — leave it untouched.

**KTD-2: `breadcrumbJsonLd` takes an ordered array of `{name, url}` items.**
Two items covers every case here (`[{section, /section}, {title, /section/id}]`). The array shape is extensible without over-engineering.

**KTD-3: Multiple `<script type="application/ld+json">` tags on one page is valid and Google-supported.**
BreadcrumbList goes in a separate `<script>` alongside the existing entity JSON-LD rather than merging into one blob. Avoids rewriting existing inline blocks.

**KTD-4: `DiscussionForumPosting` is the correct schema for forum threads.**
Google's documentation recommends this type for user-generated discussion content. It accepts `headline`, `text`, `author`, `url`, and `datePublished`.

**KTD-5: Hub page OG `type` stays `"website"` (not `"collection"`).**
There is no standard OG type for listing pages; `website` is the correct fallback. Per-entity detail pages already use `"article"` or `"website"` as appropriate via `entityMetadata`.

---

## Scope Boundaries

**In scope:** `src/lib/jsonLd.ts`, `src/lib/__tests__/jsonLd.test.ts`, the five hub `page.tsx` files, the three missing-JSON-LD detail pages, all other detail pages for BreadcrumbList wiring, `src/app/sitemap.ts`.

**Out of scope:**
- hreflang — DA/EN are cookie-based on the same URL, so standard hreflang doesn't cleanly apply; deferred until URL-based locale routing ships.
- OG images for blog/skills detail pages — separate design work.
- Performance/Core Web Vitals — separate topic.

### Deferred to Follow-Up Work
- `AgentDetailView.tsx` emits inline JSON-LD from a client component, duplicating the server-rendered JSON-LD in `agents/[id]/page.tsx`. Low risk today but worth removing the client-side copy in a cleanup pass.
- `agents/page.tsx` has no static metadata either — but `/agents` is deprioritized in the current positioning strategy, so it's lower urgency than the five hub pages above.

---

## Implementation Units

### U1. Hub page static metadata

**Goal:** Add `export const metadata: Metadata` to showcase, forum, agents, mcp, and cli hub pages so crawlers see distinct titles and descriptions.

**Requirements:** R1.

**Dependencies:** None.

**Files:**
- `src/app/showcase/page.tsx`
- `src/app/forum/page.tsx`
- `src/app/agents/page.tsx`
- `src/app/mcp/page.tsx`
- `src/app/cli/page.tsx`

**Approach:** Each page gets a top-level `export const metadata: Metadata` block. Fields: `title` (short, descriptive — used by the layout template which appends `" | vibetrends.dk"`), `description` (1–2 sentences matching the page's DA-language copy in translations.ts), `alternates.canonical`, and matching `openGraph` + `twitter` fields. Use `entityMetadata` from `src/lib/seo.ts` — it already handles the full OG/Twitter shape. Pass `path: "/showcase"` etc.

**Patterns to follow:** `src/app/skills/topic/[slug]/page.tsx` — it exports `metadata` via `generateMetadata` using `entityMetadata`. The static export pattern is the same, just without `async`.

**Test scenarios:**
- Test expectation: none — static metadata exports have no logic to unit-test. Verify via `<title>` and `<meta name="description">` in rendered HTML or view-source on each page.

**Verification:** `curl -s https://vibetrends.dk/showcase | grep '<title>'` returns a page-specific title, not the global fallback. Same for /forum, /mcp, /cli, /agents.

---

### U2. Extend jsonLd.ts — breadcrumbJsonLd and forumThreadJsonLd helpers

**Goal:** Add two reusable JSON-LD builders that detail pages will use in U3 and U4.

**Requirements:** R2, R3.

**Dependencies:** None.

**Files:**
- `src/lib/jsonLd.ts`
- `src/lib/__tests__/jsonLd.test.ts`

**Approach:**

`breadcrumbJsonLd(items: {name: string; url: string}[])` — emits a `BreadcrumbList` with one `ListItem` per entry, `position` starting at 1. The `url` field on each item should be an absolute URL (callers pass `https://vibetrends.dk/showcase/id`).

`forumThreadJsonLd(opts: {title, author, url, datePublished?})` — emits a `DiscussionForumPosting` with `headline`, `author: {Person}`, `url`, and optional `datePublished`. Mirrors the shape of `articleJsonLd`.

**Patterns to follow:** Existing helper signatures in `src/lib/jsonLd.ts` — typed input object, returns a plain object (not serialized), callers pass it through `jsonLdScript()`.

**Test scenarios:**
- `breadcrumbJsonLd` with two items → `@type` is `"BreadcrumbList"`, `itemListElement` has length 2, first item has `position: 1` and correct `name`/`item` fields.
- `breadcrumbJsonLd` with one item → `itemListElement` has length 1.
- `forumThreadJsonLd` with all fields → `@type` is `"DiscussionForumPosting"`, `headline` matches title, `author.name` matches author, `datePublished` is present.
- `forumThreadJsonLd` without `datePublished` → `datePublished` key is absent from output (mirrors `articleJsonLd` behavior).
- Both helpers: output passes through `jsonLdScript()` without throwing (smoke test for XSS-escape path).

**Verification:** `npm test src/lib/__tests__/jsonLd.test.ts` passes with new cases covering both helpers.

---

### U3. Add missing JSON-LD to mcp/[id], cli/[id], and forum/[id]

**Goal:** Bring mcp, cli, and forum detail pages to the same JSON-LD coverage level as agents, blog, and showcase.

**Requirements:** R4, R5.

**Dependencies:** U2.

**Files:**
- `src/app/mcp/[id]/page.tsx`
- `src/app/cli/[id]/page.tsx`
- `src/app/forum/[id]/page.tsx`

**Approach:**

- `mcp/[id]`: import `softwareAppJsonLd` from `@/lib/jsonLd` and add a `<script>` block in the server component's return, populated with the MCP server's name, description, developer, and canonical URL. Mirror the pattern in `agents/[id]/page.tsx`.
- `cli/[id]`: same — import `softwareAppJsonLd`, add `<script>` block. Mirror `agents/[id]/page.tsx`.
- `forum/[id]`: import `forumThreadJsonLd` (from U2), add `<script>` block with thread title, author username, canonical URL, and `created_at` if available from the DB row.

**Patterns to follow:** `src/app/agents/[id]/page.tsx` — the full pattern for server-rendered JSON-LD alongside `entityMetadata`.

**Test scenarios:**
- Test expectation: none for the page components themselves — JSON-LD rendering is integration-level. Verify via view-source on a rendered detail page confirming the `<script type="application/ld+json">` block is present with the correct `@type`.

**Verification:** View-source on `/mcp/<id>`, `/cli/<id>`, `/forum/<id>` — each has a `<script type="application/ld+json">` with the correct `@type` value.

---

### U4. Wire BreadcrumbList into all detail pages

**Goal:** Every detail page emits a `BreadcrumbList` JSON-LD block to unlock breadcrumb rich results in Google SERPs.

**Requirements:** R6.

**Dependencies:** U2, U3 (U3 ensures all detail pages are in a consistent state before adding BreadcrumbList uniformly).

**Files:**
- `src/app/showcase/[id]/page.tsx`
- `src/app/skills/[id]/page.tsx`
- `src/app/skills/topic/[slug]/page.tsx`
- `src/app/blog/[id]/page.tsx`
- `src/app/agents/[id]/page.tsx`
- `src/app/mcp/[id]/page.tsx`
- `src/app/cli/[id]/page.tsx`
- `src/app/forum/[id]/page.tsx`

**Approach:** In each server component's `return`, add a second `<script type="application/ld+json">` block alongside the existing entity JSON-LD. Call `breadcrumbJsonLd([{name: "Section Label", url: "https://vibetrends.dk/section"}, {name: entity.title, url: "https://vibetrends.dk/section/id"}])`. Section labels: "Showcase", "Skills", "Blog", "Agents", "MCP", "CLI", "Forum". Use the entity's actual title as the leaf crumb name.

**Patterns to follow:** The existing `<script dangerouslySetInnerHTML={{ __html: jsonLdScript(...) }}>` pattern already in each of these files. Add a sibling `<script>` block immediately after.

**Test scenarios:**
- Test expectation: none — view-source verification is the right check for this wiring.

**Verification:** Google's Rich Results Test (or view-source) on a showcase item URL confirms a `BreadcrumbList` block with two items: `{Showcase, /showcase}` and `{project title, /showcase/id}`.

---

### U5. Sitemap priority differentiation

**Goal:** Signal content hierarchy to crawlers by elevating showcase and blog post detail entries above the flat 0.6 baseline.

**Requirements:** R7.

**Dependencies:** None.

**Files:**
- `src/app/sitemap.ts`

**Approach:** In the `detailEntries` map, apply conditional priority: paths starting with `/showcase/` → 0.7, paths starting with `/blog/` → 0.7, everything else → 0.6. The current flat `.map()` becomes a `.map((path) => ({ ..., priority: path.startsWith("/showcase/") || path.startsWith("/blog/") ? 0.7 : 0.6 }))`. Hub static entries stay at their current values (1.0 for home, 0.8 for sections).

**Patterns to follow:** Existing sitemap entry shape in `src/app/sitemap.ts`.

**Test scenarios:**
- Test expectation: none — priority values are a crawl hint, not user-facing behavior. Verify by fetching `/sitemap.xml` and spot-checking a `/showcase/` URL has `<priority>0.7</priority>`.

**Verification:** `curl https://vibetrends.dk/sitemap.xml | grep -A3 "showcase/"` shows `<priority>0.7</priority>` for a showcase item, and `curl ... | grep -A3 "cli/"` shows `<priority>0.6</priority>`.

---

## Open Questions

None blocking.

**Deferred:**
- Whether to add `ItemList` JSON-LD to the showcase hub page (analogous to `skillsListJsonLd` on skills/page.tsx). Not included here — the showcase hub renders projects client-side with search/filter state, making server-rendered list data harder to inject cleanly.
