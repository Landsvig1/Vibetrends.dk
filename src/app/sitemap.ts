import { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { getSkills, getProjects, getAgents, getCli, getBlogPosts, getThreads } from "@/lib/db";
import { SKILL_CATEGORY_SLUGS } from "@/lib/skillCategories";

const baseUrl = "https://vibetrends.dk";

/**
 * Real lastmod, or omitted — never a fabricated date. Google ignores lastmod
 * sitewide once it catches a site re-stamping every URL with the build date
 * (confirmed here: all 150 URLs shared one <lastmod> before this fix), so a
 * fallback "best guess" date would just resurrect the same problem.
 */
function parseLastMod(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

function entry(
  path: string,
  lastModified: string | undefined,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  priority: number
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${path}`,
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");

  // No source of truth for these (hub pages aggregate content that changes
  // independently of the hub itself) — omit lastmod rather than guess.
  const staticEntries: MetadataRoute.Sitemap = [
    "",
    "/about",
    "/skills",
    "/vibes",
    "/forum",
    "/blog",
    "/cli",
    "/mcp",
    "/agent-guide",
    "/privacy",
    "/terms",
  ].map((route) => entry(route, undefined, "daily", route === "" ? 1.0 : 0.8));

  // Pull community-submitted content so detail pages are crawlable. The Agents
  // section is demoted, so feed-worthy rows are crawled under their feed type:
  // CLIs at /cli, MCP servers at /mcp. Host rows are excluded by the
  // data layer and intentionally not surfaced.
  const [skills, projects, clisRaw, mcpServersRaw, posts, threadsRaw] = await Promise.all([
    getSkills(),
    getProjects(),
    getCli(),
    getAgents(undefined, "MCP Server"),
    getBlogPosts(),
    getThreads(),
  ]);

  // Exclude e2e fixture rows (scripts/seed-e2e-fixtures.mjs) — they're
  // short-lived and must never be crawled/indexed. Filtering both `agents`-
  // sourced lists (clis, mcpServers), not just the one the current fixture
  // happens to seed, so a future fixture category change can't silently
  // start leaking into the sitemap.
  const isFixture = (id: string) => id.startsWith("e2e-fixture-");
  const clis = clisRaw.filter((a) => !isFixture(a.id));
  const mcpServers = mcpServersRaw.filter((a) => !isFixture(a.id));
  const threads = threadsRaw.filter((t) => !isFixture(t.id));

  // Showcase and blog detail pages carry user-generated content that is more
  // likely to attract external links — bump their priority to signal freshness.
  // `vibes.created_at` is a real timestamptz. `blog_posts.published_at` is
  // free-text supplied by the submitter (schemas.ts caps it at 50 chars with
  // no format check) — parse it and drop lastmod for rows that don't parse
  // rather than assume every value is a valid date.
  const highValueDetails: MetadataRoute.Sitemap = [
    ...projects.map((p) => entry(`/vibes/${p.id}`, parseLastMod(p.createdAt), "weekly", 0.7)),
    ...posts.map((b) => entry(`/blog/${b.id}`, parseLastMod(b.publishedAt), "weekly", 0.7)),
  ];

  // No real per-row date for these: skill topic pages are static aggregations;
  // `skills.doc_fetched_at` records when refresh-skill-docs.mjs last ran, not
  // when the rendered content changed (the script unconditionally stamps
  // `now()` on every run, even when the re-fetched markdown is byte-identical
  // — see scripts/refresh-skill-docs.mjs), so it would lie the same way
  // `today` did; `agents` (clis/mcpServers) has no date column at all.
  const noDateDetails: MetadataRoute.Sitemap = [
    ...SKILL_CATEGORY_SLUGS.map((slug) => entry(`/skills/topic/${slug}`, undefined, "weekly", 0.6)),
    ...skills.map((s) => entry(`/skills/${s.id}`, undefined, "weekly", 0.6)),
    ...clis.map((a) => entry(`/cli/${a.id}`, undefined, "weekly", 0.6)),
    ...mcpServers.map((a) => entry(`/mcp/${a.id}`, undefined, "weekly", 0.6)),
  ];

  // `forum_threads.created_at` is a real timestamptz.
  const threadDetails: MetadataRoute.Sitemap = threads.map((t) =>
    entry(`/forum/${t.id}`, parseLastMod(t.createdAt), "weekly", 0.6)
  );

  return [...staticEntries, ...highValueDetails, ...noDateDetails, ...threadDetails];
}
