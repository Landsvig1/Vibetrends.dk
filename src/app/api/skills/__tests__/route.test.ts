import { describe, it, expect, vi } from "vitest";

// The route module imports the data layer and the Supabase server client at
// load time; mock them so importing skillSchema is hermetic (no DB/env).
vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(),
  createSkill: vi.fn(),
  parseSkillView: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ getAuthUser: vi.fn() }));

import { skillSchema } from "@/app/api/skills/route";

// Guards the POST /api/skills submission contract after the add-skill flow was
// reshaped: only title + link (githubUrl) are essential; description and tags
// are optional. Category must be one of the current topic slugs.

const base = {
  title: "My Skill",
  category: "full-stack" as const,
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
  it("accepts every current topic slug", () => {
    for (const category of [
      "full-stack",
      "marketing",
      "webshop",
      "front-end",
      "back-end",
      "design",
      "agent-workflows",
    ]) {
      expect(skillSchema.safeParse({ ...base, category }).success).toBe(true);
    }
  });

  it("rejects a legacy / unknown category", () => {
    for (const category of ["nextjs", "mobile", "database", "testing", "design-ui"]) {
      expect(skillSchema.safeParse({ ...base, category }).success).toBe(false);
    }
  });
});
