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

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type,
      locale,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
