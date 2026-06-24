/**
 * Single source of truth for the forum category set.
 *
 * The canonical key for each category is its English string — the value stored
 * in `forum_threads.category` and used in `?category=` query params. Keeping
 * English strings as keys means no database migration is needed.
 *
 * Every place that needs the category list — the TypeScript type, the Zod enum,
 * the filter chips, and the submit dropdown — derives from this file.
 */

export const FORUM_CATEGORY_KEYS = [
  "General",
  "Prompts",
  "Showcase Discussion",
  "Setup & Config",
] as const;

export type ForumCategoryKey = (typeof FORUM_CATEGORY_KEYS)[number];

export interface ForumCategory {
  key: ForumCategoryKey;
  labelDa: string;
  labelEn: string;
}

export const FORUM_CATEGORIES: readonly ForumCategory[] = [
  { key: "General",            labelDa: "Generelt",           labelEn: "General" },
  { key: "Prompts",            labelDa: "Prompts",            labelEn: "Prompts" },
  { key: "Showcase Discussion", labelDa: "Showcase-diskussion", labelEn: "Showcase Discussion" },
  { key: "Setup & Config",     labelDa: "Opsætning & Config", labelEn: "Setup & Config" },
] as const;

const CATEGORY_BY_KEY: Record<string, ForumCategory> = Object.fromEntries(
  FORUM_CATEGORIES.map((c) => [c.key, c]),
);

export function getForumCategory(key: string): ForumCategory | undefined {
  return CATEGORY_BY_KEY[key];
}

/**
 * Resolve a category key to its localised display label.
 * Falls back to the raw key so a legacy or unknown value never renders blank.
 */
export function forumCategoryLabel(key: string, lang: "da" | "en" = "da"): string {
  const cat = CATEGORY_BY_KEY[key];
  if (!cat) return key;
  return lang === "en" ? cat.labelEn : cat.labelDa;
}
