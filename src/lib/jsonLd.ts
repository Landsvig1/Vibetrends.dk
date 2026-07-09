/**
 * Serialize data for safe embedding inside a <script type="application/ld+json">
 * block. Escapes "<" so user-controlled strings cannot break out of the script
 * element (e.g. a title containing "</script>") and inject executable markup.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** schema.org Article for a blog post detail page. */
export function articleJsonLd(opts: {
  title: string;
  description: string;
  author: string;
  url: string;
  /** Required by Google's Article rich-result validator. */
  image: string;
  datePublished?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    image: opts.image,
    author: { "@type": "Person", name: opts.author },
    url: opts.url,
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    publisher: { "@type": "Organization", name: "vibetrends.dk" },
  };
}

/** schema.org ItemList of skills, shared by the Skills hub and topic landings. */
export function skillsListJsonLd(
  skills: { title: string; description: string; vibeCoder: string; githubUrl?: string }[],
  name: string,
  description: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: skills.length,
    itemListElement: skills.map((skill, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "SoftwareSourceCode",
        name: skill.title,
        description: skill.description,
        author: { "@type": "Person", name: skill.vibeCoder },
        ...(skill.githubUrl ? { codeRepositoryUrl: skill.githubUrl } : {}),
      },
    })),
  };
}

/**
 * schema.org SoftwareApplication for an agent / MCP server / CLI detail page.
 * No `offers` or `aggregateRating`: these are free community-submitted tools
 * with no real pricing or rating data, and Google treats fabricated rating
 * claims as a manual-action risk — omit rather than fabricate.
 */
export function softwareAppJsonLd(opts: {
  name: string;
  description: string;
  developer: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: opts.name,
    description: opts.description,
    applicationCategory: "DeveloperApplication",
    author: { "@type": "Organization", name: opts.developer },
    url: opts.url,
  };
}

/** schema.org BreadcrumbList for two-level page hierarchy (section → detail). */
export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** schema.org DiscussionForumPosting for a forum thread detail page. */
export function forumThreadJsonLd(opts: {
  title: string;
  author: string;
  url: string;
  /** Required by Google's rich-result validator; pass the site default when no thread-specific image exists. */
  image: string;
  datePublished?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: opts.title,
    image: opts.image,
    author: { "@type": "Person", name: opts.author },
    url: opts.url,
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
  };
}
