import { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { getSkills, getProjects, getAgents, getCli, getBlogPosts, getThreads, isE2eFixtureId } from "@/lib/db";
import { SKILL_CATEGORY_SLUGS } from "@/lib/skillCategories";
import { hasBlogContent, hasForumContent } from "@/lib/hubContent";

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

/**
 * No changefreq and no priority: Google has said for years that it ignores
 * both, and they were pure noise here — every hub claimed "daily" and the
 * priorities encoded an editorial ranking no crawler reads. lastmod is the one
 * field that still carries signal, and only when it's real (see parseLastMod).
 */
function entry(path: string, lastModified?: string): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${path}`,
    ...(lastModified ? { lastModified } : {}),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");

  // Pull community-submitted content so detail pages are crawlable. The Agents
  // section is retired, so every `agents` row is crawled under its feed type:
  // CLIs at /cli, MCP servers at /mcp. Host rows are excluded by the
  // data layer and intentionally not surfaced.
  const [skills, projects, clisRaw, mcpServersRaw, postsRaw, threadsRaw, forumHasContent, blogHasContent] =
    await Promise.all([
      getSkills(),
      getProjects(),
      getCli(),
      getAgents(undefined, "MCP Server"),
      getBlogPosts(),
      getThreads(),
      // Not derived from threadsRaw/postsRaw above: those reads collapse a
      // query failure into [], which would drop a populated hub out of the
      // sitemap. These two fail open instead (lib/hubContent.ts).
      hasForumContent(),
      hasBlogContent(),
    ]);

  // Exclude e2e fixture rows (scripts/seed-e2e-fixtures.mjs) — they're
  // short-lived and must never be crawled/indexed. Every list is filtered, not
  // just the ones the current fixture happens to seed, so a future fixture
  // category change can't silently start leaking into the sitemap. Blog is
  // filtered for a second reason: the hub gate below discounts fixture posts,
  // so without this the sitemap could omit /blog while still listing
  // /blog/e2e-fixture-… detail URLs.
  const clis = clisRaw.filter((a) => !isE2eFixtureId(a.id));
  const mcpServers = mcpServersRaw.filter((a) => !isE2eFixtureId(a.id));
  const threads = threadsRaw.filter((t) => !isE2eFixtureId(t.id));
  const posts = postsRaw.filter((b) => !isE2eFixtureId(b.id));

  // No source of truth for hub lastmod (they aggregate content that changes
  // independently of the hub itself) — omit it rather than guess.
  //
  // /forum and /blog are held back while they have no rows: submitting a
  // contentless hub for indexing is what earns a thin-content impression. The
  // same two predicates drive their robots noindex (forum/layout.tsx,
  // blog/page.tsx) and hide them from the header nav (lib/hubContent.ts), so
  // all three reverse together on the first thread or published post.
  const staticEntries: MetadataRoute.Sitemap = [
    "",
    "/about",
    "/skills",
    "/vibes",
    ...(forumHasContent ? ["/forum"] : []),
    ...(blogHasContent ? ["/blog"] : []),
    "/cli",
    "/mcp",
    "/agent-guide",
    "/privacy",
    "/terms",
  ].map((route) => entry(route));

  // `vibes.created_at` is a real timestamptz. `blog_posts.published_at` is
  // free-text supplied by the submitter (schemas.ts caps it at 50 chars with
  // no format check) — parse it and drop lastmod for rows that don't parse
  // rather than assume every value is a valid date.
  const datedDetails: MetadataRoute.Sitemap = [
    ...projects.map((p) => entry(`/vibes/${p.id}`, parseLastMod(p.createdAt))),
    ...posts.map((b) => entry(`/blog/${b.id}`, parseLastMod(b.publishedAt))),
  ];

  // No real per-row date for these: skill topic pages are static aggregations;
  // `skills.doc_fetched_at` records when refresh-skill-docs.mjs last ran, not
  // when the rendered content changed (the script unconditionally stamps
  // `now()` on every run, even when the re-fetched markdown is byte-identical
  // — see scripts/refresh-skill-docs.mjs), so it would lie the same way
  // `today` did; `agents` (clis/mcpServers) has no date column at all.
  const noDateDetails: MetadataRoute.Sitemap = [
    ...SKILL_CATEGORY_SLUGS.map((slug) => entry(`/skills/topic/${slug}`)),
    ...skills.map((s) => entry(`/skills/${s.id}`)),
    ...clis.map((a) => entry(`/cli/${a.id}`)),
    ...mcpServers.map((a) => entry(`/mcp/${a.id}`)),
  ];

  // `forum_threads.created_at` is a real timestamptz.
  const threadDetails: MetadataRoute.Sitemap = threads.map((t) =>
    entry(`/forum/${t.id}`, parseLastMod(t.createdAt))
  );

  return [...staticEntries, ...datedDetails, ...noDateDetails, ...threadDetails];
}
