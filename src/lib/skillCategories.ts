/**
 * Single source of truth for the Skills taxonomy.
 *
 * Every place that needs the category list — the filter chips, the submit
 * form, the Zod validation, the MCP tool schema, the hub cards, the topic
 * landings and the sitemap — derives from THIS file. Changing a category, its
 * Danish wording, its icon or its accent is a one-line edit here that
 * propagates everywhere. There are no other category lists in the codebase.
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
  /** Accent colour (hex) for the category's hub card and landing hero. */
  accent: string;
}

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  {
    slug: "agent-methodology",
    labelDa: "Agent-metodik",
    labelEn: "Agent Methodology",
    descDa: "Hvordan agenter planlægger, fejlfinder og bygger skills.",
    descEn: "How agents plan, debug, and build skills.",
    icon: "Bot",
    accent: "#fbbf24",
  },
  {
    slug: "frontend",
    labelDa: "Frontend & UI",
    labelEn: "Frontend & UI",
    descDa: "UI-frameworks, komponenter og klient-side værktøjer.",
    descEn: "UI frameworks, components, and client-side tooling.",
    icon: "Atom",
    accent: "#38bdf8",
  },
  {
    slug: "backend-data",
    labelDa: "Backend & Data",
    labelEn: "Backend & Data",
    descDa: "Serverframeworks, ORM'er, databaser og storage.",
    descEn: "Server frameworks, ORMs, databases, and storage.",
    icon: "Database",
    accent: "#60a5fa",
  },
  {
    slug: "fullstack-devops",
    labelDa: "Full-Stack & DevOps",
    labelEn: "Full-Stack & DevOps",
    descDa: "App-værktøjer på tværs af stakken, deployment, test og drift.",
    descEn: "Cross-cutting app tooling, deployment, testing, and ops.",
    icon: "Layers",
    accent: "#a78bfa",
  },
  {
    slug: "design-ux",
    labelDa: "Design & UX",
    labelEn: "Design & UX",
    descDa: "Visuel og interaktionsdesign, design systems.",
    descEn: "Visual and interaction design, design systems.",
    icon: "Palette",
    accent: "#f472b6",
  },
  {
    slug: "growth-content",
    labelDa: "Vækst & Indhold",
    labelEn: "Growth & Content",
    descDa: "SEO, copywriting og content-strategi.",
    descEn: "SEO, copywriting, and content strategy.",
    icon: "Megaphone",
    accent: "#f59e0b",
  },
  {
    slug: "compliance",
    labelDa: "Compliance & Governance",
    labelEn: "Compliance & Governance",
    descDa: "GDPR og andre juridiske/regulatoriske krav.",
    descEn: "GDPR and other legal/regulatory requirements.",
    icon: "ShieldCheck",
    accent: "#34d399",
  },
  {
    slug: "domain-data",
    labelDa: "Domænedata & Research",
    labelEn: "Domain Data & Research",
    descDa: "Eksterne data- og API-opslag.",
    descEn: "External data and API lookups.",
    icon: "Search",
    accent: "#f87171",
  },
] as const;

const SKILL_CATEGORY_BY_SLUG: Record<string, SkillCategory> = Object.fromEntries(
  SKILL_CATEGORIES.map((c) => [c.slug, c]),
);

export function getSkillCategory(slug: string): SkillCategory | undefined {
  return SKILL_CATEGORY_BY_SLUG[slug];
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
