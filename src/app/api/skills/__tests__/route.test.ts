import { describe, it, expect, vi } from "vitest";

// The route module imports the data layer and the Supabase server client at
// load time; mock them so importing skillSchema is hermetic (no DB/env).
vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(),
  createSkill: vi.fn(),
  parseSkillView: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ getAuthUser: vi.fn(), resolveBotRequestAuth: vi.fn() }));

import { skillSchema } from "@/app/api/skills/route";

// Guards the POST /api/skills submission contract after the add-skill flow was
// reshaped: only title + link (githubUrl) are essential; description and tags
// are optional. Category must be one of the current skill category slugs.

const base = {
  title: "My Skill",
  category: "fullstack-devops" as const,
  githubUrl: "https://github.com/foo/bar",
};

describe("skillSchema — required fields", () => {
  it("accepts title + link only (description and tags omitted)", () => {
    expect(skillSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a missing link", () => {
    const { githubUrl, ...noLink } = base;
    void githubUrl;
    expect(skillSchema.safeParse(noLink).success).toBe(false);
  });

  it("rejects a non-URL link", () => {
    expect(skillSchema.safeParse({ ...base, githubUrl: "not-a-url" }).success).toBe(false);
  });

  it("rejects a missing title", () => {
    const { title, ...noTitle } = base;
    void title;
    expect(skillSchema.safeParse(noTitle).success).toBe(false);
  });
});

describe("skillSchema — optional description", () => {
  it("accepts an empty-string description", () => {
    expect(skillSchema.safeParse({ ...base, description: "" }).success).toBe(true);
  });

  it("accepts a short description (no min length)", () => {
    expect(skillSchema.safeParse({ ...base, description: "hi" }).success).toBe(true);
  });

  it("rejects an over-long description", () => {
    expect(skillSchema.safeParse({ ...base, description: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("skillSchema — category enum", () => {
  it("accepts every current skill category slug", () => {
    for (const category of [
      "agent-methodology",
      "frontend",
      "backend-data",
      "fullstack-devops",
      "design-ux",
      "growth-content",
      "compliance",
      "domain-data",
    ]) {
      expect(skillSchema.safeParse({ ...base, category }).success).toBe(true);
    }
  });

  it("rejects a legacy / unknown category", () => {
    for (const category of [
      "nextjs", "mobile", "database", "testing", "design-ui", // skills.sh-era slugs
      "full-stack", "marketing", "webshop", "front-end", "back-end", "design", "agent-workflows", // prior discipline-era slugs
    ]) {
      expect(skillSchema.safeParse({ ...base, category }).success).toBe(false);
    }
  });
});

describe("skillSchema — source", () => {
  it("accepts a valid source URL (bot-imported skill attribution)", () => {
    expect(
      skillSchema.safeParse({ ...base, source: "https://github.com/mikkelkrogsholm/skills" }).success
    ).toBe(true);
  });

  it("accepts omitting source entirely (human web-form submissions)", () => {
    expect(skillSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an empty-string source the same way githubUrl's siblings handle empty string", () => {
    expect(skillSchema.safeParse({ ...base, source: "" }).success).toBe(true);
  });

  it("rejects a non-URL source", () => {
    expect(skillSchema.safeParse({ ...base, source: "not-a-url" }).success).toBe(false);
  });
});

describe("skillSchema — tags security limits", () => {
  it("accepts valid tags array and elements", () => {
    expect(skillSchema.safeParse({ ...base, tags: ["clean-code", "refactoring"] }).success).toBe(true);
  });

  it("rejects tags array with elements exceeding 50 characters", () => {
    const longTag = "a".repeat(51);
    expect(skillSchema.safeParse({ ...base, tags: [longTag] }).success).toBe(false);
  });

  it("rejects tags array exceeding 10 elements", () => {
    const tooManyTags = Array(11).fill("tag");
    expect(skillSchema.safeParse({ ...base, tags: tooManyTags }).success).toBe(false);
  });
});
