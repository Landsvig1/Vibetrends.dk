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
  // getCollections already drops one-member collections, so whatever it
  // returns is exactly what should be listed.
  collections: [] as { slug: string; title: string; count: number }[],
  // Set to make the hub count reads reject, simulating a Supabase failure.
  countsFail: false,
}));

vi.mock("next/cache", () => ({
  cacheLife: (profile: string) => { state.cacheLifeCalls.push(profile); },
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Minimal shape matching what the sitemap function accesses from each row.
// Two skills with real, distinct content_updated_at values plus one legacy
// `seed_*` row, whose id carries no creation epoch and so has none.
const mockSkills = [
  { id: "skill-1", slug: "react-dashboard", contentUpdatedAt: "2026-03-02T10:00:00Z" },
  { id: "skill-2", slug: "seo-geo", contentUpdatedAt: "2026-04-11T08:30:00Z" },
  { id: "seed_legacy", slug: "legacy-skill", contentUpdatedAt: null },
];
const mockProjects = [{ id: "proj-1", slug: "dansk-designsystem", createdAt: "2026-05-01T00:00:00Z" }];
const mockClis = [
  { id: "cli-1", slug: "claude-code" },
  { id: "e2e-fixture-ignored", slug: "e2e-fixture-cli" },
];
const mockMcpServers = [
  { id: "mcp-1", slug: "supabase-mcp" },
  { id: "e2e-fixture-ignored", slug: "e2e-fixture-mcp" },
];
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
  getCollections: vi.fn(async () => state.collections),
  // Real implementation, not a stub: the sitemap and the hub layouts must agree
  // on which rows count, and a mocked-away filter would hide a disagreement.
  isE2eFixtureId: (id: string) => id.startsWith("e2e-fixture-"),
  // The hub gate reads counts, not rows (lib/hubContent.ts). Derived from the
  // same fixtures the row lists use, so a test can't set up a state where the
  // count and the detail URLs disagree. Counting here mirrors the SQL filter in
  // countRealRows, which is what excludes fixtures in production.
  countRealThreads: vi.fn(async () => {
    if (state.countsFail) throw new Error("supabase unavailable");
    return state.threads.filter((t) => !t.id.startsWith("e2e-fixture-")).length;
  }),
  countRealBlogPosts: vi.fn(async () => {
    if (state.countsFail) throw new Error("supabase unavailable");
    return state.posts.filter((p) => !p.id.startsWith("e2e-fixture-")).length;
  }),
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
  state.collections = [{ slug: "dev-skills", title: "Dev Skills", count: 33 }];
  state.countsFail = false;
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

  // The sitemap half of the fail-open contract (lib/hubContent.ts). A failed
  // count read must not drop a hub: dropping a populated /forum from the
  // sitemap on a transient Supabase blip is the expensive mistake, since
  // recovery waits on a re-crawl. Keeping an empty one listed for a while is
  // the cheap one.
  it("keeps /forum and /blog listed when the hub count reads fail", async () => {
    state.posts = [];
    state.threads = [];
    state.countsFail = true;

    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/forum`);
    expect(urls).toContain(`${baseUrl}/blog`);
  });

  it("keeps the other hubs when /blog and /forum are held back", async () => {
    state.posts = [];
    state.threads = [];
    const urls = (await sitemap()).map((e) => e.url);
    for (const hub of ["", "/about", "/skills", "/vibes", "/cli", "/mcp", "/agent-guide", "/privacy", "/terms"]) {
      expect(urls).toContain(`${baseUrl}${hub}`);
    }
  });

  it("includes skill detail pages, on their slug", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/skills/react-dashboard`);
    expect(urls).toContain(`${baseUrl}/skills/seo-geo`);
  });

  // The whole point of Phase B: one canonical URL per entity. An id-form entry
  // here would hand Google a second URL for the same page, split the link
  // equity the 308 exists to consolidate, and do it silently.
  it("emits no id-form detail URL on any catalog surface", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    const ids = ["skill-1", "skill-2", "proj-1", "cli-1", "mcp-1"];
    for (const url of urls) {
      for (const id of ids) {
        expect(url.endsWith(`/${id}`)).toBe(false);
      }
    }
  });

  // A collection URL in the sitemap must always have a page behind it.
  // getCollection refuses to render below two members and getCollections
  // applies the same threshold, so the sitemap lists exactly what it returns.
  it("includes collection pages, and lists none when there are no collections", async () => {
    expect((await sitemap()).map((e) => e.url)).toContain(`${baseUrl}/skills/samling/dev-skills`);

    state.collections = [];
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes("/skills/samling/"))).toBe(false);
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
    expect(urls).toContain(`${baseUrl}/vibes/dansk-designsystem`);
  });

  it("includes CLI agent detail pages and excludes e2e fixtures", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/cli/claude-code`);
    expect(urls).not.toContain(`${baseUrl}/cli/e2e-fixture-cli`);
  });

  it("includes MCP server detail pages and excludes e2e fixtures", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/mcp/supabase-mcp`);
    expect(urls).not.toContain(`${baseUrl}/mcp/e2e-fixture-mcp`);
  });

  it("includes blog post detail pages", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/blog/post-1`);
  });

  // The e2e seed doesn't touch blog_posts today. Asserted anyway because the
  // /blog hub gate discounts fixture rows: if that ever changes and the detail
  // entries aren't filtered too, the sitemap would omit /blog while still
  // listing its fixture detail URLs.
  it("excludes e2e fixture blog posts from detail pages", async () => {
    state.posts = [...mockPosts, { id: "e2e-fixture-post", publishedAt: "2026-06-15" }];
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/blog/post-1`);
    expect(urls).not.toContain(`${baseUrl}/blog/e2e-fixture-post`);
  });

  it("omits /blog when its only posts are e2e fixtures", async () => {
    state.posts = [{ id: "e2e-fixture-post", publishedAt: "2026-06-15" }];
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).not.toContain(`${baseUrl}/blog`);
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

    expect(byUrl("/vibes/dansk-designsystem")?.lastModified).toBe(new Date("2026-05-01T00:00:00Z").toISOString());
    expect(byUrl("/blog/post-1")?.lastModified).toBe(new Date("2026-06-15").toISOString());
    expect(byUrl("/forum/thread-1")?.lastModified).toBe(new Date("2026-07-01T00:00:00Z").toISOString());
  });

  it("omits lastModified where there is no real source of truth", async () => {
    const entries = await sitemap();
    const byUrl = (path: string) => entries.find((e) => e.url === `${baseUrl}${path}`);

    expect(byUrl("")).not.toHaveProperty("lastModified");
    expect(byUrl("/skills")).not.toHaveProperty("lastModified");
    // Topic pages aggregate content that changes independently of them, and
    // `agents` has no date column — neither gained one alongside skills.
    expect(byUrl("/skills/topic/agent-methodology")).not.toHaveProperty("lastModified");
    expect(byUrl("/cli/claude-code")).not.toHaveProperty("lastModified");
    expect(byUrl("/mcp/supabase-mcp")).not.toHaveProperty("lastModified");
  });

  it("uses skills.content_updated_at as the skill lastmod", async () => {
    const entries = await sitemap();
    const byUrl = (path: string) => entries.find((e) => e.url === `${baseUrl}${path}`);

    expect(byUrl("/skills/react-dashboard")?.lastModified).toBe(
      new Date("2026-03-02T10:00:00Z").toISOString()
    );
    expect(byUrl("/skills/seo-geo")?.lastModified).toBe(
      new Date("2026-04-11T08:30:00Z").toISOString()
    );
  });

  // A legacy `seed_*` id has no creation epoch to seed content_updated_at from.
  // Omitting lastmod is the honest outcome; a fallback guess would be the
  // fabricated date this whole mechanism exists to avoid.
  it("omits lastmod for a skill with no content_updated_at rather than guessing", async () => {
    const entries = await sitemap();
    const legacy = entries.find((e) => e.url === `${baseUrl}/skills/legacy-skill`);
    expect(legacy).toBeDefined();
    expect(legacy).not.toHaveProperty("lastModified");
  });

  /**
   * The direct regression guard on the original bug — all 150 URLs sharing one
   * build date, which is what taught Google to ignore lastmod here — and the
   * check that catches a Phase C shipping green while emitting nothing: a
   * change that left every row null would pass every other assertion above.
   */
  it("emits at least one skill lastmod, and no two skills share a value", async () => {
    const entries = await sitemap();
    const skillDates = entries
      .filter((e) => /\/skills\/[^/]+$/.test(e.url) && !e.url.includes("/topic/"))
      .map((e) => e.lastModified)
      .filter((d): d is string | Date => d !== undefined)
      .map((d) => new Date(d).toISOString());

    expect(skillDates.length).toBeGreaterThan(0);
    expect(new Set(skillDates).size).toBe(skillDates.length);
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

// ---------------------------------------------------------------------------
// Repo-wide completeness check for the slug migration.
//
// The sitemap test owns this because the sitemap is where a missed producer
// does the most damage: a stray id-form URL is a second indexable address for
// a page that already has a canonical one, which is exactly the split the 308
// exists to prevent — and nothing else in the suite would notice.
//
// The pattern is deliberately narrow. Matching the bare `/skills/${` would also
// hit the (correct) slug templates in the detail pages, so it could not tell
// the two apart; this matches only an interpolation that resolves to an id.
// ---------------------------------------------------------------------------

describe("no page-facing template still builds a detail URL from an id", () => {
  it("finds no /{surface}/${...id} template under src/", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    // The `(?<!/api)` guard keeps the legitimate id-keyed API calls in the
    // explorers (`/api/skills/${id}`, `/api/skills/${id}/upvote`) out of it —
    // those are route handlers, not page URLs, and must stay on the id.
    const ID_URL = /(?<!\/api)\/(skills|vibes|cli|mcp)\/\$\{[A-Za-z0-9_.]*\bid\}/;

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
      });
    }

    const offenders = walk("src")
      .filter((f) => ID_URL.test(readFileSync(f, "utf8")))
      // API routes are id-keyed by design (/api/skills/{id}) and are not page URLs.
      .filter((f) => !f.startsWith(join("src", "app", "api")));

    expect(offenders).toEqual([]);
  });
});
