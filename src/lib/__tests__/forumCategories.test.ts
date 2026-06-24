import { describe, it, expect } from "vitest";
import {
  FORUM_CATEGORY_KEYS,
  FORUM_CATEGORIES,
  getForumCategory,
  forumCategoryLabel,
} from "@/lib/forumCategories";

describe("forumCategories taxonomy", () => {
  it("FORUM_CATEGORY_KEYS has exactly 4 entries matching FORUM_CATEGORIES order", () => {
    expect(FORUM_CATEGORY_KEYS).toHaveLength(4);
    expect(FORUM_CATEGORIES).toHaveLength(4);
    expect([...FORUM_CATEGORY_KEYS]).toEqual(FORUM_CATEGORIES.map((c) => c.key));
  });

  it("getForumCategory resolves a known key and returns its record", () => {
    const cat = getForumCategory("General");
    expect(cat?.key).toBe("General");
    expect(cat?.labelDa).toBeTruthy();
    expect(cat?.labelEn).toBeTruthy();
  });

  it("getForumCategory returns undefined for an unknown key", () => {
    expect(getForumCategory("unknown-key")).toBeUndefined();
  });

  it("forumCategoryLabel returns the da label for da", () => {
    expect(forumCategoryLabel("Prompts", "da")).toBe("Prompts");
    expect(forumCategoryLabel("General", "da")).toBe("Generelt");
    expect(forumCategoryLabel("Setup & Config", "da")).toBe("Opsætning & Config");
  });

  it("forumCategoryLabel returns the en label for en", () => {
    expect(forumCategoryLabel("General", "en")).toBe("General");
    expect(forumCategoryLabel("Showcase Discussion", "en")).toBe("Showcase Discussion");
    expect(forumCategoryLabel("Setup & Config", "en")).toBe("Setup & Config");
  });

  it("forumCategoryLabel falls back to the raw key for an unknown value", () => {
    expect(forumCategoryLabel("legacy-value")).toBe("legacy-value");
    expect(forumCategoryLabel("legacy-value", "en")).toBe("legacy-value");
  });

  it("forumCategoryLabel default lang is da", () => {
    const withDa = forumCategoryLabel("General", "da");
    const withDefault = forumCategoryLabel("General");
    expect(withDefault).toBe(withDa);
  });
});
