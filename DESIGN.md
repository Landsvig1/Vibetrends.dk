---
name: vibetrends.dk
description: Warm paper and forest ink — a field notebook for AI builders, kept rather than generated.
colors:
  paper: "#FAF9F6"
  ink: "#1E1E1E"
  ink-soft: "#4F4F4C"
  card: "#FFFFFF"
  rule: "#E6E3DC"
  forest: "#264021"
  forest-wash: "#F0F4EF"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
  overline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.2em"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1
  quote:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.forest}"
    textColor: "#FFFFFF"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    typography: "{typography.label}"
  button-secondary-hover:
    backgroundColor: "{colors.forest-wash}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  card-hover:
    backgroundColor: "{colors.card}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  pill-badge:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
    typography: "{typography.label}"
  chip-category:
    backgroundColor: "{colors.forest-wash}"
    textColor: "{colors.forest}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  chip-tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  nav-item:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.forest-wash}"
    textColor: "{colors.forest}"
---

# Design System: vibetrends.dk

## Overview

**Creative North Star: "The Field Notebook"**

vibetrends.dk looks like something a person kept, not something a machine
generated. The ground is warm paper, the accent is forest ink, and the pages are
laid out the way a careful practitioner keeps records: hairline rules, generous
air, entries in a consistent hand. It is a catalog of AI tooling that pointedly
refuses to look like AI tooling — no dark mode, no neon, no glow, no gradient
mesh, no synthwave violet. The restraint is the argument: this material was
chosen by someone, and the surface should read that way.

The system arrived there deliberately. An earlier violet/cyan/rose identity was
stripped out of the components in favour of the single forest accent; if a
saturated hue reappears in this codebase, it is a regression, not a survival.

The density is comfortable rather than tight. Cards are white rectangles on
paper, separated by a single hairline (`#E6E3DC`) and a lot of whitespace. Depth
is almost entirely absent — one nearly invisible ambient shadow is the whole
vocabulary. What moves is what you can interact with: cards lift 2px and take a
forest border on hover, and route changes slide horizontally in the direction
you're travelling. Motion is the interaction signal; shadow is not.

Typography does the emotional work through weight, not through decoration. Plus
Jakarta Sans carries everything — extrabold and tight at display sizes, plain and
airy in body — while a monospace face marks anything machine-ish (vote counts,
install commands, tags) and Instrument Serif appears in one place only, as an
italic voice for quoted human text. That split is the system's whole thesis in
miniature: **sans for the work, mono for the machine, serif for the human.**

**Key Characteristics:**

- Warm paper ground (`#FAF9F6`), never white, never dark
- Single deep-forest accent (`#264021`) used sparingly and with intent
- Flat by default; hairline borders carry all structure
- Pill-shaped buttons, gently rounded cards (12px), sharp small chips (4px)
- Light-mode only, by declaration (`colorScheme: "light"`)
- Danish-only interface; strings are written natively, not translated
- Motion signals interactivity and direction, never decoration

## Colors

A two-temperature palette: warm neutral paper against a cool, desaturated
forest green. There is no secondary or tertiary accent, and that is deliberate.

### Primary

- **Forest Ink** (`#264021`): The only accent in the system. Active navigation,
  primary buttons, links, category chips, focus rings, hovered card borders,
  and the `.dk` in the wordmark. Deep enough (contrast ≈ 11:1 on paper) to carry
  body-weight text, dark enough to read as ink rather than as brand color.
- **Forest Wash** (`#F0F4EF`): The tinted rest state that pairs with Forest Ink —
  active nav item backgrounds, category chip fills, code block grounds, the
  secondary-button hover. Never used for text.

### Neutral

- **Warm Paper** (`#FAF9F6`): The page ground and the theme color. Also the fill
  for inputs, tags, and inset surfaces, which is why cards read as *raised* even
  without a shadow — they are the whiter surface.
- **Card White** (`#FFFFFF`): Card, header, and panel fill. The only pure white
  in the system.
- **Hairline** (`#E6E3DC`): Every border, divider, and rule. Warm-tinted, never
  grey. This is the workhorse token — the system's structure is almost entirely
  built from it.
- **Ink** (`#1E1E1E`): Primary text, headings, and any content that must be read
  first. Off-black, never `#000`.
- **Soft Ink** (`#4F4F4C`): Secondary text, descriptions, metadata, inactive nav,
  and icon defaults. Warm-shifted grey that sits on the same temperature axis as
  the paper.

### Named Rules

**The Single Ink Rule.** Forest Ink is the only chromatic color in the system.
If a new state, badge, or category needs to be distinguished, distinguish it with
weight, size, border, or Forest Wash — not with a new hue. Semantic status colors
(destructive red, success green) are permitted only where the meaning is
genuinely semantic, and never as decoration.

**The Warm Neutral Rule.** Every neutral carries warmth. Raw Tailwind greys
(`slate-*`, `gray-*`, `zinc-*`) are cold and visibly clash with the paper. Use
the tokens.

**The Paper Floor Rule.** No dark mode. The surface is a lit page; the system
declares `colorScheme: "light"` and has no dark variants. Don't add
`dark:` variants to new components — a half-implemented dark mode is worse than
none.

## Typography

**Display / Body Font:** Plus Jakarta Sans (weights 400, 500, 600, 700; 800 via
`font-extrabold`), with `system-ui, sans-serif` fallback
**Accent Font:** Instrument Serif 400, roman and italic, with `Georgia, serif`
fallback
**Data Font:** the system monospace stack (`ui-monospace, SFMono-Regular, Menlo`)

**Character:** One humanist sans does nearly all the work, spanning a wide weight
range so hierarchy comes from mass rather than from family-switching. Against it,
a monospace face marks anything a machine produced or consumes, and a serif
italic marks anything a human said. The pairing reads competent and unhurried
rather than technical.

### Hierarchy

- **Display** (800, `clamp(2.25rem, 6vw, 3.75rem)`, line-height 1, tracking
  `-0.025em`): Page-opening headlines only, centered, capped at ~56ch
  (`max-w-4xl`). The accent phrase inside it is set in Forest Ink *italic* — the
  one place italic sans is permitted.
- **Headline** (700, 1.5rem, 1.3): Section headings and detail-page titles.
- **Title** (700, 1.125rem, 1.25): Card titles. Shifts to Forest Ink on card
  hover.
- **Body** (400, 1rem, 1.7): Paragraphs and descriptions in Soft Ink. Prose
  containers cap at `max-w-3xl` (~65–75ch); card descriptions clamp to 2–3 lines.
- **Label** (600, 0.75rem, 1): Chips, badges, nav items, form labels, buttons.
  Never uppercase at this size.
- **Overline** (700, 0.625rem / 10px, `0.2em` tracking, uppercase): The only
  uppercase-tracked step, and the floor of the ramp — nothing is set smaller than
  10px. Used for the wordmark tagline and micro-labels on tags and metadata.
- **Data** (mono, 700, 0.625–0.75rem): Vote counts, install commands, tags, IDs,
  the `.dk` in the wordmark. Install strings sit in a Paper-filled, hairline-bordered
  block with `select-all` and horizontal scroll.
- **Quote** (Instrument Serif italic, 0.875rem, 1.6, ~80% opacity): Human excerpt
  text — currently forum thread previews. Nothing else.

### Named Rules

**The Three Voices Rule.** Sans for the work, mono for the machine, serif for the
human. Every font choice must answer to one of those three; there is no fourth
voice. Reaching for the serif to make something feel "premium" breaks the system.

**The Weight-Not-Family Rule.** Build hierarchy by moving between 400 / 600 / 700
/ 800 in Plus Jakarta Sans. Don't introduce a new family, and don't use size alone
where weight would do it.

## Layout

A single centered column system: `max-w-7xl` (80rem) with responsive gutters of
16px / 24px / 32px (`px-4 sm:px-6 lg:px-8`) and vertical page padding of 32px
rising to 48px at `md`. The header is a sticky 64px bar at the same max width;
the layout is a flex column with the footer pinned below a `flex-1` main.

Content is organized as card grids — typically 3 or 4 columns collapsing to 1 on
mobile — with 24px gutters. Sections stack on a 48–56px rhythm
(`space-y-12 sm:space-y-14`); elements within a card stack on 16px and 24px.
Prose surfaces narrow to `max-w-3xl` and center.

Breakpoints follow Tailwind defaults; the meaningful ones are `sm` (640px, where
type steps up and secondary CTAs appear) and `lg` (1024px, where the desktop nav
replaces the mobile menu). Density does not change between breakpoints — the
layout reflows, it doesn't compress.

**The Air Rule.** Whitespace is the primary structuring device, ahead of borders
and far ahead of color. When a layout feels cluttered, remove elements or add
space before adding a divider.

## Elevation & Depth

**This system is flat.** Depth is carried by hairline borders and tonal contrast
(white card on warm paper), not by shadows. There is exactly one shadow token,
and it is deliberately near-invisible — an ambient settling, not a lift. Dropdowns
and modals are the only surfaces permitted to read as genuinely floating, and they
do it with a backdrop blur and a standard drop shadow rather than a bespoke
elevation ramp.

What communicates interactivity is **motion**, not elevation: a hovered card
translates up 2px and swaps its hairline for a Forest Ink border over 300ms.

### Shadow Vocabulary

- **Ambient settle** (`box-shadow: 0 20px 40px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.01)`):
  The default card shadow. Wide, soft, and almost imperceptible — it keeps cards
  from looking pasted on, and does nothing more.
- **Overlay** (Tailwind `shadow-lg`): Dropdown menus and modal panels only.

### Named Rules

**The Flat-By-Default Rule.** New surfaces get a hairline border, not a shadow.
If something needs to stand out, change its background to Card White or Forest
Wash before you reach for elevation.

**The Border-Becomes-Accent Rule.** The universal hover signal is the hairline
turning Forest Ink plus a 2px rise — not a shadow bloom, not a background change.
Apply it consistently so hoverability is learnable.

## Shapes

Rounding is scaled to size and function, and the steps are meaningful:

- **Pill** (99px) — anything that reads as an action or a status you could press:
  buttons, badges, filter pills. All primary and secondary buttons are fully
  pill-shaped; this is the most recognizable shape signature in the system.
- **Large** (12px, `rounded-xl`) — cards and card-like containers.
- **Extra large** (16px, `rounded-2xl`) — full-width empty states, which pair it
  with a *dashed* hairline border to read as an unfilled slot.
- **Medium** (8px, `rounded-lg`) — inputs, textareas, code blocks, icon buttons,
  dropdown panels.
- **Small** (6px, `rounded-md`) — tag chips, nav items.
- **Extra small** (4px, `rounded`) — category chips and inline code, which stay
  nearly square so they read as labels rather than as buttons.

Borders are always 1px and always the hairline token; there are no double rules,
and no colored borders except the Forest Ink hover state and `accent-primary/20`
chip outlines. The single exception is the blockquote rule inside `.skill-doc`
(3px hairline on the left edge), which is a typographic quote marker in rendered
prose, not a container border — it needs the weight to read as a quote. It is the
only border above 1px in the system, and no card, list item, callout, or nav item
may take one. An accent tab down the side of a container is the most
recognizable tell of generated UI; active states here are marked with a Forest
Wash fill, never with an edge bar. Nothing in the system is clipped, angled, or
asymmetric — every corner is a uniform radius.

**The Pill-Means-Press Rule.** Full-round (99px) is reserved for actionable
things. A non-interactive container must never be pill-shaped, or the shape
vocabulary stops meaning anything.

## Components

### Buttons

- **Shape:** Fully rounded pill (99px), 10px × 20px padding, weight 600.
- **Primary:** Forest Ink fill, white text, 1px Forest Ink border. Hover drops to
  90% opacity over 200ms — the fill does not change color.
- **Secondary:** Paper fill, Ink text, hairline border. Hover fills with Forest
  Wash.
- **Focus:** 2px Forest Ink outline at 4px offset, applied globally to every
  interactive element. Never remove it.
- **Icon buttons:** 8px radius (not pill), Paper fill, hairline border, 14px
  icon, hover shifts icon and border toward Forest Ink.

### Chips

- **Category chip:** Forest Wash fill, Forest Ink text, `accent-primary/20`
  border, 4px radius, 12px or smaller. Marks taxonomy.
- **Tag chip:** Paper fill, Soft Ink text, hairline border, 6px radius,
  monospace, 10px. Marks free-form metadata.
- **Pill badge:** Paper fill, hairline border, 99px, 12px semibold with a 14px
  leading icon. Used as a section eyebrow above headings.

The distinction is load-bearing: **tinted means taxonomy, outlined means
metadata.**

### Cards / Containers

- **Corner Style:** 12px radius.
- **Background:** Card White on the Warm Paper page.
- **Border:** 1px hairline.
- **Shadow Strategy:** ambient settle only (see Elevation & Depth).
- **Internal Padding:** 24px, with 16px and 24px internal stacks.
- **Hover / focus-within:** border → Forest Ink, `translateY(-2px)`, 300ms
  `cubic-bezier(0.4, 0, 0.2, 1)`. Title text shifts to Forest Ink.
- **Whole-card link:** an absolutely positioned overlay link covers the card at
  `z-10`; interactive controls inside it sit at `z-20` and stop propagation. This
  is the standard pattern — reuse it rather than nesting anchors.

### Inputs / Fields

- **Style:** Paper fill on white cards, 1px hairline, 8px radius, 8–10px × 14px
  padding, 14px text.
- **Focus:** border shifts to `accent-primary/20`; search fields add a 1px
  `accent-primary/30` ring. The global 2px Forest Ink focus outline is the
  accessibility floor underneath this.
- **Placeholder:** Soft Ink.
- **Textarea:** identical, `resize-none`; monospace where the field holds
  configuration.

### Navigation

- **Header:** sticky, `z-50`, Card White at 85% with `backdrop-blur-md`, hairline
  bottom border, 64px tall.
- **Items:** 14px medium, Soft Ink, 6px radius, 8px × 12px padding, with a 16px
  leading icon.
- **Active:** Forest Ink text on Forest Wash fill. Matching is prefix-based, so a
  detail page keeps its section lit.
- **Hover:** text → Ink, background → hairline color.
- **Dropdown:** opens on hover *and* focus-within, 176px wide, 8px radius,
  hairline border, overlay shadow, with an invisible 16px hover bridge above it.
- **Mobile:** below `lg`, a hamburger toggle opens a full-width panel;
  the desktop nav and CTA are hidden.

### Route Transitions (signature)

Navigation uses the View Transitions API with directional semantics: moving
"forward" in the nav order slides content in from the right (`nav-forward`),
moving back slides from the left (`nav-back`), each 400ms with a 150/210ms
crossfade. The header and footer are explicitly anchored and excluded from the
animation so they never flicker.

Every transition is fully disabled under `prefers-reduced-motion: reduce`, along
with the card hover lift. Preserve that guard on anything new.

## Do's and Don'ts

### Do:

- **Do** use the CSS custom properties (`--background`, `--foreground`,
  `--text-secondary`, `--card-bg`, `--card-border`, `--accent-primary`,
  `--accent-light`) or their Tailwind aliases. They are the single source of
  truth in `src/app/globals.css`.
- **Do** reach for `.glass-card` for any new card. Despite the vestigial name it
  is the flat card primitive, and it carries the hover, focus-within, and
  reduced-motion behavior for free.
- **Do** signal hover with the border-to-Forest-Ink swap plus a 2px rise.
- **Do** keep the global focus-visible outline (2px Forest Ink, 4px offset) on
  every interactive element.
- **Do** guard new motion behind `prefers-reduced-motion: reduce`.
- **Do** use monospace for machine text — commands, counts, tags, IDs — and
  reserve Instrument Serif italic for quoted human writing.
- **Do** write user-visible strings in Danish. The da/en toggle was removed in PR #94; there is no translation layer to route copy through.
- **Do** let whitespace carry structure before adding a divider.

### Don't:

- **Don't** introduce a second accent hue. Forest Ink is the only chromatic color
  (see The Single Ink Rule).
- **Don't** use raw Tailwind palette classes for neutrals — `slate-*`, `gray-*`,
  `zinc-*` are cold and clash with the warm paper. The codebase is clean of them;
  keep it that way.
- **Don't** add dark mode or `dark:` variants. The system is declared light-only.
- **Don't** reintroduce violet, cyan, or rose. They were the previous identity and
  have been removed from every component; upvote affordances hover to Forest Ink,
  and multi-item accents step down through `accent-primary` opacity rather than
  through hue.
- **Don't** reach for shadows to create hierarchy. Use hairline borders and the
  paper/white tonal step.
- **Don't** make a non-interactive container pill-shaped.
- **Don't** use `hover:bg-card-border` — a border token is not a hover surface.
  Hover fills are Forest Wash (`hover:bg-accent-light`).
- **Don't** set a literal font size off the ramp. Every step from Overline (10px)
  up to Display is in the frontmatter; 9px and 11px one-offs have been removed.
- **Don't** set `font-serif` to make something feel premium. It has exactly one
  job.
- **Don't** style prose from third-party markdown ad hoc — `.skill-doc` in
  `globals.css` already owns rendered SKILL.md / README.md output.
