import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for src/app/sitemap.ts — verifies:
 * 1. All six entity types produce correct URLs in the output.
 * 2. The sitemap function is decorated with "use cache" and calls
 *    cacheLife with the 'hours' profile (source-inspection-equivalent
 *    assertion — actual cache-hit behavior isn't testable under Vitest
 *    per U2's precedent; the directive is a no-op string in this runtime).
 */

const state = vi.hoisted(() => ({
  cacheLifeCalls: [] as string[],
}));

vi.mock("next/cache", () => ({
  cacheLife: (profile: string) => { state.cacheLifeCalls.push(profile); },
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Minimal shape matching what the sitemap function accesses from each row.
const mockSkills = [{ id: "skill-1" }, { id: "skill-2" }];
const mockProjects = [{ id: "proj-1" }];
const mockClis = [{ id: "cli-1" }, { id: "e2e-fixture-ignored" }];
const mockMcpServers = [{ id: "mcp-1" }, { id: "e2e-fixture-ignored" }];
const mockPosts = [{ id: "post-1" }];
const mockThreads = [{ id: "thread-1" }, { id: "e2e-fixture-ignored" }];

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(async () => mockSkills),
  getProjects: vi.fn(async () => mockProjects),
  getAgents: vi.fn(async () => mockMcpServers),
  getCli: vi.fn(async () => mockClis),
  getBlogPosts: vi.fn(async () => mockPosts),
  getThreads: vi.fn(async () => mockThreads),
}));

// SKILL_CATEGORY_SLUGS is used to generate /skills/topic/<slug> entries.
vi.mock("@/lib/skillCategories", () => ({
  SKILL_CATEGORY_SLUGS: ["agent-methodology", "prompt-engineering"],
}));

import sitemap from "@/app/sitemap";

const baseUrl = "https://vibetrends.dk";

beforeEach(() => {
  state.cacheLifeCalls = [];
});

describe("sitemap()", () => {
  it("calls cacheLife with the 'hours' profile", async () => {
    await sitemap();
    expect(state.cacheLifeCalls).toContain("hours");
  });

  it("includes all static hub URLs", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}`);
    expect(urls).toContain(`${baseUrl}/skills`);
    expect(urls).toContain(`${baseUrl}/vibes`);
    expect(urls).toContain(`${baseUrl}/forum`);
    expect(urls).toContain(`${baseUrl}/blog`);
    expect(urls).toContain(`${baseUrl}/cli`);
    expect(urls).toContain(`${baseUrl}/mcp`);
  });

  it("includes skill detail pages", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/skills/skill-1`);
    expect(urls).toContain(`${baseUrl}/skills/skill-2`);
  });

  it("includes skill topic/category pages", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/skills/topic/agent-methodology`);
    expect(urls).toContain(`${baseUrl}/skills/topic/prompt-engineering`);
  });

  it("includes vibe (project) detail pages", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/vibes/proj-1`);
  });

  it("includes CLI agent detail pages and excludes e2e fixtures", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/cli/cli-1`);
    expect(urls).not.toContain(`${baseUrl}/cli/e2e-fixture-ignored`);
  });

  it("includes MCP server detail pages and excludes e2e fixtures", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/mcp/mcp-1`);
    expect(urls).not.toContain(`${baseUrl}/mcp/e2e-fixture-ignored`);
  });

  it("includes blog post detail pages", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/blog/post-1`);
  });

  it("includes forum thread detail pages and excludes e2e fixtures", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/forum/thread-1`);
    expect(urls).not.toContain(`${baseUrl}/forum/e2e-fixture-ignored`);
  });

  it("every entry has a url, lastModified, changeFrequency, and priority", async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry).toHaveProperty("url");
      expect(entry).toHaveProperty("lastModified");
      expect(entry).toHaveProperty("changeFrequency");
      expect(entry).toHaveProperty("priority");
    }
  });
});
