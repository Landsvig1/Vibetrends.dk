import { describe, it, expect } from "vitest";
import { skillSchema, projectSchema, agentSchema, blogPostSchema } from "../schemas";

/**
 * Every URL field in schemas.ts must be http(s). These values are rendered as
 * links and also flow into JSON-LD, MCP output and submission manifests, so a
 * scheme like javascript: or data: must be rejected at the schema, not left to
 * whatever renders it.
 */

const skillBase = { title: "T", category: "frontend", githubUrl: "https://github.com/a/b" };
const projectBase = { title: "T", description: "A long enough description" };
const agentBase = { name: "N", category: "CLI" as const, description: "A long enough description" };
const blogBase = {
  title: "T",
  excerpt: "E",
  content: "C",
  readTime: "3 min",
  publishedAt: "2026-10-20",
  imageUrl: "https://images.unsplash.com/photo-1",
  category: "Guides",
};

// imageUrl fields are also host-allowlisted, so their bad values keep an
// allowed host to prove the scheme check alone rejects them.
const badSchemes = ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com/x"];
const badImageSchemes = [
  "javascript://images.unsplash.com/%0aalert(1)",
  "data:image/png;base64,AAAA",
  "ftp://images.unsplash.com/photo-1",
];

const fields: {
  name: string;
  parse: (v: string) => boolean;
  good: string;
  bad: string[];
  emptyOk: boolean;
}[] = [
  { name: "skill.githubUrl", parse: (v) => skillSchema.safeParse({ ...skillBase, githubUrl: v }).success, good: "https://github.com/a/b", bad: badSchemes, emptyOk: false },
  { name: "skill.source", parse: (v) => skillSchema.safeParse({ ...skillBase, source: v }).success, good: "https://github.com/a/b", bad: badSchemes, emptyOk: true },
  { name: "project.demoUrl", parse: (v) => projectSchema.safeParse({ ...projectBase, demoUrl: v }).success, good: "https://example.com", bad: badSchemes, emptyOk: true },
  { name: "project.githubUrl", parse: (v) => projectSchema.safeParse({ ...projectBase, githubUrl: v }).success, good: "https://github.com/a/b", bad: badSchemes, emptyOk: false },
  { name: "project.imageUrl", parse: (v) => projectSchema.safeParse({ ...projectBase, imageUrl: v }).success, good: "https://images.unsplash.com/photo-1", bad: badImageSchemes, emptyOk: true },
  { name: "agent.sourceUrl", parse: (v) => agentSchema.safeParse({ ...agentBase, sourceUrl: v }).success, good: "https://github.com/a/b", bad: badSchemes, emptyOk: true },
  { name: "blogPost.imageUrl", parse: (v) => blogPostSchema.safeParse({ ...blogBase, imageUrl: v }).success, good: "https://images.unsplash.com/photo-1", bad: badImageSchemes, emptyOk: false },
];

describe("URL fields accept only http(s)", () => {
  it("base fixtures are valid", () => {
    expect(skillSchema.safeParse(skillBase).success).toBe(true);
    expect(projectSchema.safeParse(projectBase).success).toBe(true);
    expect(agentSchema.safeParse(agentBase).success).toBe(true);
    expect(blogPostSchema.safeParse(blogBase).success).toBe(true);
  });

  for (const f of fields) {
    describe(f.name, () => {
      it("accepts https and http", () => {
        expect(f.parse(f.good)).toBe(true);
        expect(f.parse(f.good.replace("https:", "http:"))).toBe(true);
      });

      for (const bad of f.bad) {
        it(`rejects ${bad.split(":")[0]}:`, () => {
          expect(f.parse(bad)).toBe(false);
        });
      }

      it(f.emptyOk ? "still accepts an empty string" : "still rejects an empty string", () => {
        expect(f.parse("")).toBe(f.emptyOk);
      });
    });
  }
});
