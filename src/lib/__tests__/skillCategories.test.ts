import { describe, it, expect } from "vitest";
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_SLUGS,
  getSkillCategory,
  skillCategoryLabel,
} from "@/lib/skillCategories";

describe("skillCategories taxonomy", () => {
  it("getSkillCategory resolves a known slug and returns both labels", () => {
    const category = getSkillCategory("backend-data");
    expect(category?.slug).toBe("backend-data");
    expect(category?.labelDa).toBeTruthy();
    expect(category?.labelEn).toBeTruthy();
  });

  it("getSkillCategory returns undefined for an unknown slug", () => {
    expect(getSkillCategory("unknown-slug")).toBeUndefined();
  });

  it("skillCategoryLabel returns the da label for da and the en label for en", () => {
    const daLabel = skillCategoryLabel("domain-data", "da");
    const enLabel = skillCategoryLabel("domain-data", "en");
    expect(daLabel).toBeTruthy();
    expect(enLabel).toBeTruthy();
    expect(daLabel).not.toBe(enLabel);
  });

  it("skillCategoryLabel falls back to the raw slug when unknown", () => {
    expect(skillCategoryLabel("legacy-value")).toBe("legacy-value");
  });

  it("SKILL_CATEGORY_SLUGS has exactly 8 entries matching SKILL_CATEGORIES in order", () => {
    expect(SKILL_CATEGORY_SLUGS).toHaveLength(8);
    expect(SKILL_CATEGORIES).toHaveLength(8);
    expect([...SKILL_CATEGORY_SLUGS]).toEqual(SKILL_CATEGORIES.map((c) => c.slug));
  });

  it("every category has non-empty bilingual labels and descriptions", () => {
    for (const category of SKILL_CATEGORIES) {
      expect(category.labelDa).toBeTruthy();
      expect(category.labelEn).toBeTruthy();
      expect(category.descDa).toBeTruthy();
      expect(category.descEn).toBeTruthy();
      expect(category.icon).toBeTruthy();
      expect(category.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("no old discipline-taxonomy slug survives in the new set", () => {
    const oldSlugs = ["back-end", "agent-workflows", "front-end", "full-stack", "design", "marketing", "webshop"];
    for (const old of oldSlugs) {
      expect(SKILL_CATEGORY_SLUGS as readonly string[]).not.toContain(old);
    }
  });
});
