/**
 * Single source of truth for the Skills taxonomy.
 *
 * The taxonomy mirrors the skills.sh domain topics (https://www.skills.sh/topic).
 * Every place that needs the topic list — the filter chips, the submit form,
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
  "frontend-react",
  "nextjs",
  "design-ui",
  "mobile",
  "agent-workflows",
  "database",
  "testing",
  "marketing",
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
    slug: "frontend-react",
    labelDa: "Frontend & React",
    labelEn: "Frontend & React",
    descDa: "UI-komponenter, hooks og React-mønstre.",
    descEn: "UI components, hooks and React patterns.",
    icon: "Atom",
    accent: "#38bdf8",
  },
  {
    slug: "nextjs",
    labelDa: "Next.js",
    labelEn: "Next.js",
    descDa: "App Router, server components og rendering.",
    descEn: "App Router, server components and rendering.",
    icon: "Triangle",
    accent: "#a78bfa",
  },
  {
    slug: "design-ui",
    labelDa: "Design & UI",
    labelEn: "Design & UI",
    descDa: "Styling, design systems og brugerflade.",
    descEn: "Styling, design systems and interface.",
    icon: "Palette",
    accent: "#f472b6",
  },
  {
    slug: "mobile",
    labelDa: "Mobil",
    labelEn: "Mobile",
    descDa: "Mobil- og cross-platform udvikling.",
    descEn: "Mobile and cross-platform development.",
    icon: "Smartphone",
    accent: "#34d399",
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
  {
    slug: "database",
    labelDa: "Database",
    labelEn: "Database",
    descDa: "Skema, queries og datalag.",
    descEn: "Schema, queries and the data layer.",
    icon: "Database",
    accent: "#60a5fa",
  },
  {
    slug: "testing",
    labelDa: "Test",
    labelEn: "Testing",
    descDa: "Unit-, integration- og E2E-test.",
    descEn: "Unit, integration and E2E testing.",
    icon: "FlaskConical",
    accent: "#fb7185",
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
