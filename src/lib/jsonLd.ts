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
  datePublished?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    author: { "@type": "Person", name: opts.author },
    url: opts.url,
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    publisher: { "@type": "Organization", name: "vibetrends.dk" },
  };
}

/** schema.org ItemList of skills, shared by the Skills hub and topic landings. */
export function skillsListJsonLd(
  skills: { title: string; description: string; vibeCoder: string }[],
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
      },
    })),
  };
}

/** schema.org SoftwareApplication for an agent / MCP server detail page. */
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
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}
