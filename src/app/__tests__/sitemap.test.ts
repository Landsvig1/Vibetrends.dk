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
  // Overridable per test: /blog and /forum are only listed once they have rows.
  posts: [] as { id: string; publishedAt: string }[],
  threads: [] as { id: string; createdAt: string }[],
}));

vi.mock("next/cache", () => ({
  cacheLife: (profile: string) => { state.cacheLifeCalls.push(profile); },
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Minimal shape matching what the sitemap function accesses from each row.
const mockSkills = [{ id: "skill-1" }, { id: "skill-2" }];
const mockProjects = [{ id: "proj-1", createdAt: "2026-05-01T00:00:00Z" }];
const mockClis = [{ id: "cli-1" }, { id: "e2e-fixture-ignored" }];
const mockMcpServers = [{ id: "mcp-1" }, { id: "e2e-fixture-ignored" }];
const mockPosts = [{ id: "post-1", publishedAt: "2026-06-15" }];
const mockThreads = [
  { id: "thread-1", createdAt: "2026-07-01T00:00:00Z" },
  { id: "e2e-fixture-ignored", createdAt: "2026-07-01T00:00:00Z" },
];

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(async () => mockSkills),
  getProjects: vi.fn(async () => mockProjects),
  getAgents: vi.fn(async () => mockMcpServers),
  getCli: vi.fn(async () => mockClis),
  getBlogPosts: vi.fn(async () => state.posts),
  getThreads: vi.fn(async () => state.threads),
}));

// SKILL_CATEGORY_SLUGS is used to generate /skills/topic/<slug> entries.
vi.mock("@/lib/skillCategories", () => ({
  SKILL_CATEGORY_SLUGS: ["agent-methodology", "prompt-engineering"],
}));

import sitemap from "@/app/sitemap";

const baseUrl = "https://vibetrends.dk";

beforeEach(() => {
  state.cacheLifeCalls = [];
  state.posts = [...mockPosts];
  state.threads = [...mockThreads];
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

  // Submitting a hub with nothing behind it is what earns a thin-content
  // impression. The hubs also emit robots noindex under the same condition
  // (forum/layout.tsx, blog/page.tsx) — these two must not drift apart.
  it("omits the /blog hub while there are no posts, and restores it once there is one", async () => {
    state.posts = [];
    expect((await sitemap()).map((e) => e.url)).not.toContain(`${baseUrl}/blog`);

    state.posts = [...mockPosts];
    expect((await sitemap()).map((e) => e.url)).toContain(`${baseUrl}/blog`);
  });

  it("omits the /forum hub while there are no threads, and restores it once there is one", async () => {
    state.threads = [];
    expect((await sitemap()).map((e) => e.url)).not.toContain(`${baseUrl}/forum`);

    state.threads = [...mockThreads];
    expect((await sitemap()).map((e) => e.url)).toContain(`${baseUrl}/forum`);
  });

  it("keeps the other hubs when /blog and /forum are held back", async () => {
    state.posts = [];
    state.threads = [];
    const urls = (await sitemap()).map((e) => e.url);
    for (const hub of ["", "/about", "/skills", "/vibes", "/cli", "/mcp", "/agent-guide", "/privacy", "/terms"]) {
      expect(urls).toContain(`${baseUrl}${hub}`);
    }
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

  // Google ignores both fields; emitting them was noise, and the priorities
  // encoded an editorial ranking no crawler reads.
  it("every entry has a url and neither changeFrequency nor priority", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry).toHaveProperty("url");
      expect(entry).not.toHaveProperty("changeFrequency");
      expect(entry).not.toHaveProperty("priority");
    }
  });

  it("uses the real per-row date for vibes, blog posts, and forum threads", async () => {
    const entries = await sitemap();
    const byUrl = (path: string) => entries.find((e) => e.url === `${baseUrl}${path}`);

    expect(byUrl("/vibes/proj-1")?.lastModified).toBe(new Date("2026-05-01T00:00:00Z").toISOString());
    expect(byUrl("/blog/post-1")?.lastModified).toBe(new Date("2026-06-15").toISOString());
    expect(byUrl("/forum/thread-1")?.lastModified).toBe(new Date("2026-07-01T00:00:00Z").toISOString());
  });

  it("omits lastModified where there is no real source of truth", async () => {
    const entries = await sitemap();
    const byUrl = (path: string) => entries.find((e) => e.url === `${baseUrl}${path}`);

    expect(byUrl("")).not.toHaveProperty("lastModified");
    expect(byUrl("/skills")).not.toHaveProperty("lastModified");
    expect(byUrl("/skills/skill-1")).not.toHaveProperty("lastModified");
    expect(byUrl("/skills/topic/agent-methodology")).not.toHaveProperty("lastModified");
    expect(byUrl("/cli/cli-1")).not.toHaveProperty("lastModified");
    expect(byUrl("/mcp/mcp-1")).not.toHaveProperty("lastModified");
  });

  it("does not stamp every entry with the same lastModified — the bug this fixes", async () => {
    const entries = await sitemap();
    const dates = entries
      .map((e) => e.lastModified)
      .filter((d): d is string | Date => d !== undefined)
      .map((d) => new Date(d).toISOString());

    expect(dates.length).toBeGreaterThan(0);
    expect(new Set(dates).size).toBeGreaterThan(1);
  });
});
