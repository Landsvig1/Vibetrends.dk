---
title: "feat: Growth loop mechanics — submit CTA, OG images, share button"
type: feat
date: 2026-06-24
status: ready
depth: standard
---

# feat: Growth loop mechanics — submit CTA, OG images, share button

## Summary

Three lightweight mechanics that close loops the showcase-first positioning opened but did not complete:

1. **Homepage submit CTA** — a third hero button linking to `/showcase?submit=1`, auto-opening the contribute modal so the inspire → contribute funnel has a clear entry point.
2. **Dynamic OG images on 4 missing detail page types** — forum threads, MCP servers, CLI tools, and skills detail pages currently fall back to the generic site image. Four new `opengraph-image.tsx` files give every shareable detail page a branded 1200×630 card.
3. **Share button on showcase detail pages** — a `"use client"` component using `navigator.share` with a clipboard fallback and pre-composed message. Turns viewers into promoters.

---

## Problem Frame

The homepage now leads with showcase ("Se hvad folk bygger med AI") but has no "submit your project" action — a visitor inspired by the showcase has nowhere obvious to go next. The contribute funnel is broken at the entry point.

Four of seven detail page types (forum, mcp, cli, skills) serve the generic `/images/og-default.jpg` when shared. Social sharing is the primary discovery channel for a community-first site; every shared thread and tool gets a generic card instead of a title-branded one.

Showcase detail pages have no share mechanic — the only path is manual URL copy with no prompt or one-tap mobile flow.

---

## Key Technical Decisions

- **`?submit=1` URL param, not a hash or dedicated route.** The submit flow lives in `showcase/page.tsx` as a `useState` modal. A URL param is the cleanest bridge from a server-rendered homepage link to that client state. Cleared via nuqs immediately after the modal opens to prevent reopening on refresh.
- **`renderOgImage(label, title)` for all four new OG files.** The existing helper in `src/lib/ogImage.tsx` handles the full branded card pattern. No per-entity custom layout is warranted in this pass.
- **Client `ShareButton` component, not inline script.** `navigator.share` and `navigator.clipboard` are browser-only APIs. A small isolated `"use client"` component is the right boundary — the rest of the showcase detail page stays server-rendered. Mirrors the `ForumReplySection` pattern in `src/app/forum/[id]/`.
- **Translation keys for submit CTA and share copy.** Both are user-visible in DA/EN via the existing `translations.ts` pattern. OG image `alt` strings stay in English, matching the established convention.

---

## Implementation Units

### U1. Homepage submit CTA

**Goal:** Add a "Indsend dit projekt" button to the homepage hero, giving visitors a direct path from inspiration to contribution.

**Dependencies:** None.

**Files:**
- `src/app/page.tsx` (modify — add third hero CTA)
- `src/lib/translations.ts` (modify — add `home.btn_submit_project` key)

**Approach:** The hero already has two CTA buttons in a `flex-wrap` row. Add a third using a ghost/outline style (lower visual weight than the primary "Se Showcase" button) so hierarchy is preserved. Link to `/showcase?submit=1`. Translation keys: `home.btn_submit_project` → "Indsend dit projekt" (DA) / "Submit your project" (EN).

**Patterns to follow:** Lines 57–72 of `src/app/page.tsx` for the existing CTA structure; `home.btn_showcase` / `home.btn_find_freelancer` for translation key naming in `src/lib/translations.ts`.

**Test scenarios:**
- Homepage renders a third CTA button in both language modes.
- The button links to `/showcase?submit=1`.
- The flex-wrap layout does not break at narrow viewports (visual check).

**Verification:** Homepage hero shows three buttons; third routes to `/showcase?submit=1`.

---

### U2. Auto-open submit modal from `?submit=1` param

**Goal:** When `/showcase?submit=1` is visited (e.g. from the homepage CTA), the submit modal opens automatically without extra clicks.

**Dependencies:** U1.

**Files:**
- `src/app/showcase/page.tsx` (modify — read `?submit=1` on mount, call `setSubmitOpen(true)`, then clear the param)

**Approach:** Add `const [submitParam, setSubmitParam] = useQueryState("submit", parseAsString.withDefault(""))` alongside the existing `q` declaration. Add a `useEffect` gated on `submitParam === "1"`: call `setSubmitOpen(true)`, then immediately `setSubmitParam(null)` so the param is cleared from the URL without a navigation. The nuqs setter updates the URL in-place.

**Patterns to follow:** `useQueryState("q", ...)` and the `projects` fetch `useEffect` in `src/app/showcase/page.tsx` (Lines 15, 26–32).

**Test scenarios:**
- Visiting `/showcase?submit=1` opens the modal.
- Visiting `/showcase` (no param) does not auto-open the modal.
- After auto-opening, the `?submit=1` param is no longer in the address bar.
- Closing and reopening the page at `/showcase` does not reopen the modal (param cleared).
- The existing `POST /api/showcase` submit flow still works after this change (no regression).

**Verification:** Clicking the U1 CTA from the homepage lands on `/showcase` with the modal open and the URL clean.

---

### U3. OG images for forum, mcp, cli, and skills detail pages

**Goal:** Give every shareable detail page type a dynamic branded OG card instead of the generic site fallback.

**Dependencies:** None (independent; pattern is fully established).

**Files:**
- `src/app/forum/[id]/opengraph-image.tsx` (create)
- `src/app/mcp/[id]/opengraph-image.tsx` (create)
- `src/app/cli/[id]/opengraph-image.tsx` (create)
- `src/app/skills/[id]/opengraph-image.tsx` (create)

**Approach:** Each file mirrors `src/app/agents/[id]/opengraph-image.tsx` exactly: import the entity's DB getter and `renderOgImage` / `ogSize` / `ogContentType` from `src/lib/ogImage.tsx`; export `size`, `contentType`, `alt`; default-export an async function that resolves `params.id`, fetches the entity, and calls `renderOgImage(label, entity?.name/title ?? "vibetrends.dk")`.

| Route | DB function | label | title field |
|---|---|---|---|
| `forum/[id]` | `getThreadById` | `"Forum"` | `thread.title` |
| `mcp/[id]` | `getAgentById` | `"MCP Server"` | `agent.name` |
| `cli/[id]` | `getAgentById` | `"CLI Tool"` | `agent.name` |
| `skills/[id]` | `getSkillById` | `"Skills Library"` | `skill.title` |

Note: `getThreadById` and `getSkillById` accept `(id, lang)`. The OG route has no language cookie; pass `"da"` as default (the entity name is language-neutral in practice).

**Patterns to follow:** `src/app/agents/[id]/opengraph-image.tsx` (12-line pattern).

**Test scenarios:**
- Each route returns HTTP 200 with `content-type: image/png` for a known entity ID (smoke test).
- An unknown ID produces a graceful fallback image with title `"vibetrends.dk"` rather than a runtime error.
- Image content is not asserted pixel-wise — smoke coverage only.

**Verification:** Visiting `/<route>/<id>/opengraph-image` in a browser returns a PNG. A social preview tool (e.g. opengraph.xyz) shows the correct title-branded card.

---

### U4. Share button on showcase detail pages

**Goal:** Add a one-tap share mechanic to showcase project detail pages so readers can promote projects without manually copying the URL.

**Dependencies:** None (independent).

**Files:**
- `src/app/components/ShareButton.tsx` (create — `"use client"` component)
- `src/app/showcase/[id]/page.tsx` (modify — import and render `<ShareButton>` in the action row)
- `src/lib/translations.ts` (modify — add `showcase.share.copied` key for the tooltip)

**Approach:** `ShareButton` receives `title: string`, `author: string`, and `url: string` as props. On click:

1. If `navigator.share` is defined, call `navigator.share({ title, url, text: \`Se hvad ${author} har bygget på vibetrends.dk: ${title}\` })`. Ignore `AbortError` (user dismissed the sheet).
2. Otherwise, call `navigator.clipboard.writeText(url)` and set a local `copied` state to `true` for 2 seconds, showing a brief "Link kopieret!" tooltip label swap.

Render as an icon-button using the `Share2` icon from lucide-react, matching the visual style of the existing GitHub icon-button in the detail page. Place it in the action row (alongside "Besøg demo" and GitHub) in `ShowcaseProjectContent`. Pass `project.title`, `project.author`, and `` `https://vibetrends.dk/showcase/${id}` `` as props.

Translation key `showcase.share.copied` → "Link kopieret!" (DA) / "Link copied!" (EN). The button label is icon-only with an `aria-label`.

**Patterns to follow:** `src/app/forum/[id]/ForumReplySection.tsx` for the client component in a server-rendered Suspense parent pattern. Existing icon-button style in `src/app/showcase/[id]/page.tsx` (the GitHub `<a>` button at approximately Line 186).

**Test scenarios:**
- `ShareButton` renders without error (no `navigator.share` in jsdom — the clipboard fallback path runs in unit test).
- Clicking with `navigator.share` defined calls `navigator.share` with the correct `title`, `url`, and `text`.
- Clicking with `navigator.share` undefined calls `navigator.clipboard.writeText(url)`.
- After clipboard copy, `copied` state is `true` and reverts to `false` after ~2 s.
- `AbortError` from `navigator.share` is swallowed without displaying an error state.
- `ShareButton` appears in the rendered `ShowcaseProjectContent` action row alongside the demo and GitHub links.

**Verification:** On a mobile browser with `navigator.share`, the native share sheet opens. On desktop Chrome without `navigator.share`, clicking copies the URL and shows "Link kopieret!" momentarily. No console errors in either path.

---

## Scope Boundaries

### In scope
- Homepage submit CTA + `?submit=1` auto-open in showcase (U1, U2)
- OG images for forum, mcp, cli, skills detail pages (U3)
- Share button on showcase detail pages only (U4)

### Deferred to Follow-Up Work
- Share button on forum threads, blog, skills, agent pages — `ShareButton` is reusable; scope expansion is intentionally deferred
- Email capture / newsletter — explicitly out of scope this PR
- URL-based locale routing — unchanged from prior roadmap deferred list
- "Submit to forum" CTA on homepage — lower leverage; forum submit is accessible directly from /forum

---

## Risks & Dependencies

- **`navigator.share` availability** — present on mobile Safari, Android Chrome, and modern desktop Chrome/Edge; absent on Firefox desktop. Clipboard fallback is essential and must be tested.
- **nuqs param clear timing** — the `setSubmitParam(null)` call must happen inside the same `useEffect` as `setSubmitOpen(true)`, not in an `onClose` handler, to avoid the modal reopening if the component remounts with the param still set.
- **`getThreadById` / `getSkillById` language param in OG routes** — these functions require a `lang` arg; pass `"da"` as a hardcoded default in the OG files since no cookie is available in that context. Entity display names are language-independent in practice (titles are Danish-only content).
- **Three-button hero layout** — adding a third button could crowd the hero on narrow viewports. Use `flex-wrap` (already in place) and a compact ghost style to avoid overflow.
