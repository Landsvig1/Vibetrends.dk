---
title: "feat: Showcase-first homepage repositioning"
date: 2026-06-24
type: feat
depth: lightweight
status: ready
---

# feat: Showcase-first homepage repositioning

**Summary:** Shift homepage copy so Showcase/Vibes reads as the primary identity (#1) and agent tools as a proud #2. Remove every trace of "find freelancer" and marketplace-for-skills framing. Pure copy change — no structural, nav, or routing changes. Both DA and EN translations stay in sync.

---

## Problem Frame

The current homepage leads with "Tools til dig og dine agenter" / "Vibe Code & Ship Faster" and positions skills-for-hire as the second CTA. This puts tooling ahead of community/inspiration. The goal for the next 6 months is to pull in vibe coders who want to see what others have built and show their own work — not to acquire freelancers.

The freelancer angle also creates the wrong first impression: it reads like a Danish Upwork niche rather than a community showcase.

---

## Requirements

- R1: Hero headline — DA leads with what people build, EN leads with inspiration and showing.
- R2: Hero description — community/showcase framing first, tools second. Both languages.
- R3: Second hero CTA — remove "Find Freelancer". Replace with "Se vores tools" (DA) / "Explore our tools" (EN) linking to `/skills`.
- R4: Remove "Book nu" / "Book now" from the featured skills card. Replace with browse-oriented label.
- R5: Remove "Freelancer" label from skills card attribution. Replace with "Vibe Coder".
- R6: Homepage section label "Udvalgt Projekt" / "Featured Project" → "Trending Vibe" in both languages.
- R7: Stats band — "Projekter Vist" / "Projects Shown" → "Vibes Vist" / "Vibes Showcased".
- R8: Footer description — community/inspiration-first in both languages.
- R9: Logo subtitle — lean toward community rather than hub + marketplace.
- R10: Page metadata (title, description, OG, Twitter) — showcase-first framing.

---

## Key Technical Decisions

**KTD-1: Translation key names stay unchanged.**
The key `home.btn_find_freelancer` is ugly but internal. Renaming it would risk a missed substitution in consuming components. Change the value, not the key. Same for `home.freelancer` and `home.book_now`.

**KTD-2: Hero headline stays hardcoded per-language in page.tsx, not extracted to translations.**
The current pattern uses JSX `<span>` markup for the colored italic word. Moving it to translations would require unsafe HTML injection or a split-key pattern. Accept the small inconsistency — change it in page.tsx directly.

**KTD-3: Second CTA href stays `/skills`.**
User confirmed this direction. The label changes from "Find Freelancer" to "Se vores tools" / "Explore our tools". No routing change.

---

## Scope Boundaries

**In scope:** `src/lib/translations.ts`, `src/app/page.tsx`, `src/app/layout.tsx` — copy only.

**Out of scope (deferred to follow-up):**
- Showcase page copy (already well-framed: "Bliv inspireret")
- Skills page copy (freelancer angle is honest there — people do hire; leave it)
- Any styling or layout changes
- Nav order changes
- New pages or features

---

## Implementation Units

### U1. Update translations.ts — DA and EN copy

**Goal:** Replace all homepage strings that carry the old positioning with showcase-first alternatives. Both languages, all keys.

**Requirements:** R1 (partial — hero desc only), R3, R4, R5, R6, R7, R8, R9.

**Dependencies:** None.

**Files:**
- `src/lib/translations.ts`

**Approach:** Change these keys in both `da` and `en` objects:

| Key | DA (new) | EN (new) |
|---|---|---|
| `home.badge` | "Dansk Vibe Coding Community & AI-hub" | "Danish Vibe Coding Community & AI Hub" |
| `home.hero_desc` | "Bliv inspireret af hvad folk bygger med AI — og vis dit eget. Plus agent tools, MCP servere, skills og CLI-tools til dine workflows." | "Discover what people are building with AI — and show what you've built. Plus agent tools, MCP servers, skills, and CLI tools for your workflows." |
| `home.btn_find_freelancer` | "Se vores tools" | "Explore our tools" |
| `home.stat.projects` | "Vibes Vist" | "Vibes Showcased" |
| `home.section.featured_project` | "Trending Vibe" | "Trending Vibe" |
| `home.book_now` | "Se alle skills" | "Browse skills" |
| `home.freelancer` | "Vibe Coder" | "Vibe Coder" |
| `footer.desc` (DA) | "Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret — og vis hvad du har bygget." | "The Danish community for vibe-coded projects and AI tools. Get inspired — and show what you built." |
| `header.logo_subtitle` | "AI Community & Tools" | "AI Community & Tools" |

**Patterns to follow:** All existing string values in this file — same quote style, no trailing commas on last item.

**Test scenarios:**
- Switching language toggle DA→EN renders all updated keys in English on the homepage.
- "Freelancer" does not appear anywhere on the rendered homepage in either language.
- "Book nu" / "Book now" does not appear on the homepage.
- "Find Freelancer" / "Find freelancer" does not appear on the homepage.

**Verification:** Load `/` in both DA and EN and do a browser text search for "freelancer" — zero hits.

---

### U2. Update page.tsx — hero headlines and CTA

**Goal:** Change the hardcoded DA/EN hero headlines, and confirm the second CTA key/href are aligned with U1's new label.

**Requirements:** R1, R3.

**Dependencies:** U1 (so the translation key the CTA uses is already updated).

**Files:**
- `src/app/page.tsx`

**Approach:**

- DA headline (line ~43–45): change from `Tools til dig og <span>dine agenter</span>` to `Se hvad folk <span>bygger med AI</span>.`
- EN headline (line ~47–49): change from `Vibe Code & <span>Ship Faster</span>.` to `Get inspired. <span>Show what you built.</span>`
- Second CTA (line ~66–72): href stays `/skills`. The `t("home.btn_find_freelancer")` call will now render the updated label from U1. No code change needed here beyond the headline.

**Patterns to follow:** Existing JSX structure — `<span className="text-accent-primary italic">` wraps the highlighted word.

**Test scenarios:**
- DA mode: hero headline reads "Se hvad folk bygger med AI." with "bygger med AI" in accent color.
- EN mode: hero headline reads "Get inspired. Show what you built." with "Show what you built." in accent color.
- Second CTA button reads "Se vores tools" (DA) / "Explore our tools" (EN) and routes to `/skills`.

**Verification:** Visual check in browser, both language modes.

---

### U3. Update layout.tsx — page metadata

**Goal:** Align the `<title>`, `description`, OG, and Twitter metadata with the showcase-first positioning.

**Requirements:** R10.

**Dependencies:** None (independent of U1/U2).

**Files:**
- `src/app/layout.tsx`

**Approach:**

- `metadata.description`: "Dansk community for vibe-kodede projekter og AI-tools. Bliv inspireret af hvad folk bygger — og vis dit eget."
- `metadata.openGraph.description`: same as above (shorter form acceptable: "Det danske community for vibe-kodede projekter og AI-tools.")
- `metadata.twitter.description`: "Det danske community for vibe-kodede projekter og AI-tools. Bliv inspireret og vis hvad du har bygget."
- Title strings: keep existing DA title — it already reads "Hub for danske AI-byggere & Vibe Coders" which is neutral enough.

No changes needed to `metadataBase`, canonical, image refs, or locale.

**Test scenarios:**
- `<meta name="description">` in page source does not contain "markedsplads" or "markedspladser".
- OG description in source matches the new framing.

**Verification:** `curl -s https://localhost:3000 | grep -i "description"` or view-source check.

---

## Open Questions

None blocking. Deferred:

- Whether to update the OG image (`og-default.jpg`) to better reflect showcase-first. Image changes are out of scope for this plan.
- Whether skills page copy should eventually remove "freelancer" language. Out of scope — honest framing there.
