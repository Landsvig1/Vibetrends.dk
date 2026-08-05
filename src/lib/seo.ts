import type { Metadata } from "next";

interface EntityMetaInput {
  /**
   * The entity name or page name, without any section suffix and without the
   * brand — this function composes the full <title> from it.
   */
  title: string;
  /**
   * Section suffix appended after the entity name, e.g. " - Skills-biblioteket".
   * Only the entity name is shortened when the composed title runs long, so
   * the suffix always survives. Omit on hub pages.
   */
  suffix?: string;
  description: string;
  /** Root-relative canonical path, e.g. "/skills/s1". Resolved against metadataBase. */
  path: string;
  lang?: "da" | "en";
  type?: "article" | "website";
  /** Optional OG image path; falls back to the site default from the root layout. */
  image?: string;
  /** Escape hatch for per-page indexing control, e.g. an empty hub. */
  robots?: Metadata["robots"];
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
const SITE_NAME = "vibetrends.dk";
/** Brand appended to every document title by entityMetadata. */
const BRAND_SUFFIX = ` | ${SITE_NAME}`;

/**
 * Truncate the entity-name portion of a title so that the name plus
 * `suffixLength` chars of trailing text stays within TITLE_MAX.
 *
 * The brand budget is deliberately NOT baked in here. It used to be, as a
 * hardcoded 16, which was invisible to call sites and wrong for the pages that
 * never rendered the brand at all: a layout exporting a plain-string `title`
 * replaces the root layout's title template object for its children, so detail
 * pages under /skills, /vibes and /forum silently dropped " | vibetrends.dk"
 * while still paying 16 chars for it. entityMetadata now owns the brand and
 * passes its length in explicitly, so the reservation matches what renders.
 */
export function truncateTitle(title: string, suffixLength = 0): string {
  const budget = TITLE_MAX - suffixLength;
  if (budget <= 0 || title.length <= budget) return title;
  return truncateAtWordBoundary(title, budget);
}

/**
 * Build per-entity metadata for a detail page: canonical URL, OpenGraph, and
 * Twitter card. Language stays cookie-based for now (one URL per entity), so the
 * canonical is the language-agnostic path; only og:locale reflects the request
 * language. URL-based locale routing is a deferred follow-up.
 *
 * The title is emitted as `title.absolute` with the brand already appended, so
 * the rendered <title> no longer depends on whether an intermediate layout
 * happens to have clobbered the root title template. The root template stays in
 * place for any page that doesn't go through this helper.
 */
export function entityMetadata({
  title,
  suffix = "",
  description,
  path,
  lang = "da",
  type = "website",
  image,
  robots,
}: EntityMetaInput): Metadata {
  const locale = lang === "en" ? "en_US" : "da_DK";
  const clampedDescription = clampDescription(description);
  const name = truncateTitle(title, suffix.length + BRAND_SUFFIX.length);
  // The brand belongs in <title>, where it is the only thing naming the site in
  // a SERP or a tab. A social card names the site through og:site_name instead,
  // so repeating it in og:title would render the brand twice on one card.
  const socialTitle = `${name}${suffix}`;
  const documentTitle = `${socialTitle}${BRAND_SUFFIX}`;

  return {
    title: { absolute: documentTitle },
    description: clampedDescription,
    alternates: { canonical: path },
    ...(robots ? { robots } : {}),
    openGraph: {
      title: socialTitle,
      // Set here rather than inherited: Next replaces the whole `openGraph`
      // object when a page supplies one, so the root layout's siteName was
      // being dropped on every page that goes through this helper — only the
      // homepage still carried it. og:title dropping the brand is only correct
      // if the card names the site some other way, so these two go together.
      siteName: SITE_NAME,
      description: clampedDescription,
      url: path,
      type,
      locale,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: clampedDescription,
      ...(image ? { images: [image] } : {}),
    },
  };
}
