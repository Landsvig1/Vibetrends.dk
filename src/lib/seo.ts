import type { Metadata } from "next";

interface EntityMetaInput {
  /** Full <title> text (the layout template appends " | vibetrends.dk"). */
  title: string;
  description: string;
  /** Root-relative canonical path, e.g. "/skills/s1". Resolved against metadataBase. */
  path: string;
  lang?: "da" | "en";
  type?: "article" | "website";
  /** Optional OG image path; falls back to the site default from the root layout. */
  image?: string;
}

const DESCRIPTION_MIN = 110;
const DESCRIPTION_MAX = 160;
/**
 * Generic, factually-neutral padding appended to descriptions under
 * DESCRIPTION_MIN. Deliberately >= DESCRIPTION_MIN chars on its own so that
 * even a 1-character input description reaches the minimum once padded.
 */
const DESCRIPTION_PAD_DA = " Find det og meget mere på vibetrends.dk — det danske community for vibe-kodede projekter, AI-skills og udviklerværktøjer.";
const DESCRIPTION_PAD_EN = " Find it and much more on vibetrends.dk — the Danish community for vibe-coded projects, AI skills, and developer tools.";

/**
 * Truncate at the last sentence/clause boundary (". " or " — ") at or before
 * `max` chars when one exists, else the last word boundary. Falls back to a
 * hard cut only when the text has no space within the truncation window
 * (e.g. a single long token) — accepted for that narrow case rather than
 * appending an ellipsis, which would itself eat into the char budget.
 * Also backs off one char when the cut would split a UTF-16 surrogate pair
 * (e.g. an emoji), which would otherwise render as a mangled U+FFFD.
 */
function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const lastCode = cut.charCodeAt(cut.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    cut = cut.slice(0, -1);
  }
  const periodIdx = cut.lastIndexOf(". ");
  if (periodIdx > 0) return cut.slice(0, periodIdx + 1).trimEnd();
  const dashIdx = cut.lastIndexOf(" — ");
  if (dashIdx > 0) return cut.slice(0, dashIdx).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Clamp a description to the 110-160 char range Google/social crawlers expect.
 * Truncates long descriptions at a word boundary; pads short-but-non-empty
 * descriptions with a generic, factually-neutral site suffix. Empty input and
 * input already in range pass through unchanged.
 */
export function clampDescription(description: string, lang: "da" | "en" = "da"): string {
  if (!description) return description;
  if (description.length > DESCRIPTION_MAX) {
    return truncateAtWordBoundary(description, DESCRIPTION_MAX);
  }
  if (description.length < DESCRIPTION_MIN) {
    const pad = lang === "en" ? DESCRIPTION_PAD_EN : DESCRIPTION_PAD_DA;
    const padded = description + pad;
    return padded.length > DESCRIPTION_MAX
      ? truncateAtWordBoundary(padded, DESCRIPTION_MAX)
      : padded;
  }
  return description;
}

const TITLE_MAX = 60;
/** Chars reserved for the root layout's title template (" | vibetrends.dk" = 16 chars). */
const TITLE_TEMPLATE_SUFFIX_BUDGET = " | vibetrends.dk".length;

/**
 * Truncate the entity-name portion of a title so the full rendered <title>
 * (entity name + this page's own suffix + the root layout's " | vibetrends.dk"
 * template) stays within TITLE_MAX. `suffixLength` is the length of whatever
 * this call site appends to the entity name before the root template applies
 * (e.g. " - Skills Library"); pass 0 when there is no page-level suffix.
 */
export function truncateTitle(title: string, suffixLength = 0): string {
  const budget = TITLE_MAX - suffixLength - TITLE_TEMPLATE_SUFFIX_BUDGET;
  if (budget <= 0 || title.length <= budget) return title;
  return truncateAtWordBoundary(title, budget);
}

/**
 * Build per-entity metadata for a detail page: canonical URL, OpenGraph, and
 * Twitter card. Language stays cookie-based for now (one URL per entity), so the
 * canonical is the language-agnostic path; only og:locale reflects the request
 * language. URL-based locale routing is a deferred follow-up.
 */
export function entityMetadata({
  title,
  description,
  path,
  lang = "da",
  type = "website",
  image,
}: EntityMetaInput): Metadata {
  const locale = lang === "en" ? "en_US" : "da_DK";
  const clampedDescription = clampDescription(description, lang);

  return {
    title,
    description: clampedDescription,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: clampedDescription,
      url: path,
      type,
      locale,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: clampedDescription,
      ...(image ? { images: [image] } : {}),
    },
  };
}
