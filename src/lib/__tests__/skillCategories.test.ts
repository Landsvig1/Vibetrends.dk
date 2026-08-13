import { describe, it, expect } from "vitest";
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_SLUGS,
  getSkillCategory,
  skillCategoryLabel,
  countByCategory,
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
    }
  });

  it("carries no per-category colour", () => {
    // The Single Ink Rule (DESIGN.md) allows one chromatic colour system-wide.
    // Categories used to define a saturated hex accent each, which put eight
    // hues on the topic grid — including the violet/cyan/rose of the removed
    // prior identity. Guard the removal rather than trusting a comment.
    for (const category of SKILL_CATEGORIES) {
      const colourish = Object.entries(category).filter(
        ([, value]) => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value),
      );
      expect(colourish).toEqual([]);
    }
  });

  it("no old discipline-taxonomy slug survives in the new set", () => {
    const oldSlugs = ["back-end", "agent-workflows", "front-end", "full-stack", "design", "marketing", "webshop"];
    for (const old of oldSlugs) {
      expect(SKILL_CATEGORY_SLUGS as readonly string[]).not.toContain(old);
    }
  });
});

describe("countByCategory", () => {
  it("seeds every topic at zero so no topic link is dropped for want of a count", () => {
    const counts = countByCategory([]);
    expect(Object.keys(counts).sort()).toEqual([...SKILL_CATEGORY_SLUGS].sort());
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it("tallies skills into their own topic", () => {
    const counts = countByCategory([
      { category: "frontend" },
      { category: "frontend" },
      { category: "compliance" },
    ]);
    expect(counts.frontend).toBe(2);
    expect(counts.compliance).toBe(1);
    expect(counts["design-ux"]).toBe(0);
  });

  it("skips rows carrying a legacy category rather than inventing a bucket", () => {
    const counts = countByCategory([
      { category: "frontend" },
      { category: "webshop" }, // retired slug still present on old rows
    ]);
    expect(counts.frontend).toBe(1);
    expect(counts).not.toHaveProperty("webshop");
    // Sums to less than the input length — the deliberate, documented outcome.
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });
});
