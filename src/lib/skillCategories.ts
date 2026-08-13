/**
 * Single source of truth for the Skills taxonomy.
 *
 * Every place that needs the category list — the filter chips, the submit
 * form, the Zod validation, the MCP tool schema, the hub cards, the topic
 * landings and the sitemap — derives from THIS file. Changing a category, its
 * Danish wording or its icon is a one-line edit here that propagates
 * everywhere. There are no other category lists in the codebase.
 *
 * Categories deliberately carry NO colour. Each one used to define a saturated
 * hex accent, which put eight hues — including the violet, cyan and rose of the
 * identity DESIGN.md records as removed — onto the topic grid, the loudest
 * screen on the site. The Single Ink Rule allows exactly one chromatic colour,
 * so topics are now distinguished by their icon, their entry count and the
 * shared Forest Wash fill. Don't reintroduce a per-category colour field.
 *
 * This module was renamed from `topics.ts` (see git history) — it was always
 * skills-only despite the more generic prior name; there is no `/vibes`-side
 * consumer of this taxonomy.
 *
 * `icon` is a lucide-react icon *name* (resolved to a component in the UI) so
 * this module stays pure data and cheap to import from server routes and the
 * sitemap without pulling icon components into their bundles.
 */

export const SKILL_CATEGORY_SLUGS = [
  "agent-methodology",
  "frontend",
  "backend-data",
  "fullstack-devops",
  "design-ux",
  "growth-content",
  "compliance",
  "domain-data",
] as const;

export type SkillCategorySlug = (typeof SKILL_CATEGORY_SLUGS)[number];

export interface SkillCategory {
  slug: SkillCategorySlug;
  labelDa: string;
  labelEn: string;
  descDa: string;
  descEn: string;
  /** lucide-react icon name, resolved to a component in the UI layer. */
  icon: string;
}

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  {
    slug: "agent-methodology",
    labelDa: "Agent-metodik",
    labelEn: "Agent Methodology",
    descDa: "Hvordan agenter planlægger, fejlfinder og bygger skills.",
    descEn: "How agents plan, debug, and build skills.",
    icon: "Bot",
  },
  {
    slug: "frontend",
    labelDa: "Frontend & UI",
    labelEn: "Frontend & UI",
    descDa: "UI-frameworks, komponenter og klient-side værktøjer.",
    descEn: "UI frameworks, components, and client-side tooling.",
    icon: "Atom",
  },
  {
    slug: "backend-data",
    labelDa: "Backend & Data",
    labelEn: "Backend & Data",
    descDa: "Serverframeworks, ORM'er, databaser og storage.",
    descEn: "Server frameworks, ORMs, databases, and storage.",
    icon: "Database",
  },
  {
    slug: "fullstack-devops",
    labelDa: "Full-Stack & DevOps",
    labelEn: "Full-Stack & DevOps",
    descDa: "App-værktøjer på tværs af stakken, deployment, test og drift.",
    descEn: "Cross-cutting app tooling, deployment, testing, and ops.",
    icon: "Layers",
  },
  {
    slug: "design-ux",
    labelDa: "Design & UX",
    labelEn: "Design & UX",
    descDa: "Visuel og interaktionsdesign, design systems.",
    descEn: "Visual and interaction design, design systems.",
    icon: "Palette",
  },
  {
    slug: "growth-content",
    labelDa: "Vækst & Indhold",
    labelEn: "Growth & Content",
    descDa: "SEO, copywriting og content-strategi.",
    descEn: "SEO, copywriting, and content strategy.",
    icon: "Megaphone",
  },
  {
    slug: "compliance",
    labelDa: "Compliance & Governance",
    labelEn: "Compliance & Governance",
    descDa: "GDPR og andre juridiske/regulatoriske krav.",
    descEn: "GDPR and other legal/regulatory requirements.",
    icon: "ShieldCheck",
  },
  {
    slug: "domain-data",
    labelDa: "Domænedata & Research",
    labelEn: "Domain Data & Research",
    descDa: "Eksterne data- og API-opslag.",
    descEn: "External data and API lookups.",
    icon: "Search",
  },
] as const;

const SKILL_CATEGORY_BY_SLUG: Record<string, SkillCategory> = Object.fromEntries(
  SKILL_CATEGORIES.map((c) => [c.slug, c]),
);

export function getSkillCategory(slug: string): SkillCategory | undefined {
  return SKILL_CATEGORY_BY_SLUG[slug];
}

/**
 * Count skills per topic slug, seeded so every one of the eight topics is
 * present at 0 rather than absent. Rows carrying a legacy or unknown category
 * are skipped, which is why the returned counts can sum to less than
 * `skills.length` — that is a data condition to notice, not to paper over.
 *
 * Shared by the client explorer's topic cards and the server-rendered
 * SkillTopicIndex so the two can never disagree about the same number.
 */
export function countByCategory(
  skills: readonly { category: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const topic of SKILL_CATEGORIES) {
    counts[topic.slug] = 0;
  }
  for (const skill of skills) {
    if (skill.category in counts) {
      counts[skill.category]++;
    }
  }
  return counts;
}

/**
 * Resolve a skill category slug to its localized label. Falls back to the raw
 * value so a legacy or unknown category never renders blank.
 */
export function skillCategoryLabel(slug: string, lang: "da" | "en" = "da"): string {
  const category = SKILL_CATEGORY_BY_SLUG[slug];
  if (!category) return slug;
  return lang === "en" ? category.labelEn : category.labelDa;
}
