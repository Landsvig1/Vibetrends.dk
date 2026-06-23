/**
 * Single source of truth for the Skills taxonomy.
 *
 * This is vibetrends' own discipline-oriented taxonomy (it no longer mirrors
 * skills.sh). Every place that needs the topic list — the filter chips, the submit form,
 * the Zod validation, the MCP tool schema, the hub cards, the topic landings
 * and the sitemap — derives from THIS file. Changing a topic, its Danish
 * wording, its icon or its accent is a one-line edit here that propagates
 * everywhere. There are no other category lists in the codebase.
 *
 * `icon` is a lucide-react icon *name* (resolved to a component in the UI) so
 * this module stays pure data and cheap to import from server routes and the
 * sitemap without pulling icon components into their bundles.
 */

export const TOPIC_SLUGS = [
  "full-stack",
  "marketing",
  "webshop",
  "front-end",
  "back-end",
  "design",
  "agent-workflows",
] as const;

export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export interface Topic {
  slug: TopicSlug;
  labelDa: string;
  labelEn: string;
  descDa: string;
  descEn: string;
  /** lucide-react icon name, resolved to a component in the UI layer. */
  icon: string;
  /** Accent colour (hex) for the topic's hub card and landing hero. */
  accent: string;
}

export const TOPICS: readonly Topic[] = [
  {
    slug: "full-stack",
    labelDa: "Full-Stack",
    labelEn: "Full-Stack",
    descDa: "End-to-end apps på tværs af frontend og backend.",
    descEn: "End-to-end apps across frontend and backend.",
    icon: "Layers",
    accent: "#a78bfa",
  },
  {
    slug: "marketing",
    labelDa: "Markedsføring",
    labelEn: "Marketing",
    descDa: "SEO, indhold og vækst.",
    descEn: "SEO, content and growth.",
    icon: "Megaphone",
    accent: "#f59e0b",
  },
  {
    slug: "webshop",
    labelDa: "Webshop",
    labelEn: "Webshop",
    descDa: "E-commerce, Shopify og storefronts.",
    descEn: "E-commerce, Shopify and storefronts.",
    icon: "ShoppingCart",
    accent: "#34d399",
  },
  {
    slug: "front-end",
    labelDa: "Front-End",
    labelEn: "Front-End",
    descDa: "UI, komponenter og klient-side.",
    descEn: "UI, components and the client side.",
    icon: "Atom",
    accent: "#38bdf8",
  },
  {
    slug: "back-end",
    labelDa: "Back-End",
    labelEn: "Back-End",
    descDa: "API'er, datalag og services.",
    descEn: "APIs, the data layer and services.",
    icon: "Database",
    accent: "#60a5fa",
  },
  {
    slug: "design",
    labelDa: "Design",
    labelEn: "Design",
    descDa: "Styling, design systems og brugerflade.",
    descEn: "Styling, design systems and interface.",
    icon: "Palette",
    accent: "#f472b6",
  },
  {
    slug: "agent-workflows",
    labelDa: "Agent-workflows",
    labelEn: "Agent workflows",
    descDa: "Agenter, automatiseringer og orkestrering.",
    descEn: "Agents, automation and orchestration.",
    icon: "Bot",
    accent: "#fbbf24",
  },
] as const;

const TOPIC_BY_SLUG: Record<string, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.slug, t]),
);

export function getTopic(slug: string): Topic | undefined {
  return TOPIC_BY_SLUG[slug];
}

/**
 * Resolve a topic slug to its localized label. Falls back to the raw value so
 * a legacy or unknown category never renders blank.
 */
export function topicLabel(slug: string, lang: "da" | "en" = "da"): string {
  const topic = TOPIC_BY_SLUG[slug];
  if (!topic) return slug;
  return lang === "en" ? topic.labelEn : topic.labelDa;
}
