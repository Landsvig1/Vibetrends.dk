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

const DESCRIPTION_MAX = 160;
/**
 * Cutting back to a sentence boundary is only worth it when it keeps most of
 * the budget. Without this floor, a description whose first sentence ends
 * early collapses to that sentence alone — a real 176-char entry was being
 * served as 89 chars because its opening sentence happened to end there.
 */
const SENTENCE_BOUNDARY_MIN_KEEP = 0.6;

/**
 * Truncate at the last sentence boundary (". ") at or before `max` chars when
 * one exists and keeps at least SENTENCE_BOUNDARY_MIN_KEEP of the budget, else
 * the last word boundary. Falls back to a hard cut only when the text has no
 * space within the truncation window (e.g. a single long token) — accepted for
 * that narrow case rather than appending an ellipsis, which would itself eat
 * into the char budget. Also backs off one char when the cut would split a
 * UTF-16 surrogate pair (e.g. an emoji), which would otherwise render as a
 * mangled U+FFFD.
 */
function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const lastCode = cut.charCodeAt(cut.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    cut = cut.slice(0, -1);
  }
  const periodIdx = cut.lastIndexOf(". ");
  if (periodIdx > max * SENTENCE_BOUNDARY_MIN_KEEP) {
    return cut.slice(0, periodIdx + 1).trimEnd();
  }
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Cap a description at the 160 chars Google/social crawlers display, cutting
 * at a sentence or word boundary. Short descriptions pass through as-is.
 *
 * There is deliberately no minimum length. An earlier version padded anything
 * under 110 chars with a generic site suffix, but the pad always overshot the
 * 160 cap and was then truncated back — on all 108 descriptions it touched it
 * produced a run-on cut mid-boilerplate ("...and screenshot Find det og meget
 * mere på vibetrends.dk"), and never once landed a description in the intended
 * range. Short-but-accurate beats padded-and-garbled, and description length
 * is not a ranking factor, so the padding was removed rather than repaired.
 */
export function clampDescription(description: string): string {
  if (!description) return description;
  return description.length > DESCRIPTION_MAX
    ? truncateAtWordBoundary(description, DESCRIPTION_MAX)
    : description;
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
  const clampedDescription = clampDescription(description);

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
