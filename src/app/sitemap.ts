import { MetadataRoute } from "next";
import { getSkills, getProjects, getAgents, getCli, getBlogPosts, getThreads } from "@/lib/db";
import { TOPIC_SLUGS } from "@/lib/topics";

const baseUrl = "https://vibetrends.dk";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const today = new Date().toISOString().split("T")[0];

  const staticEntries: MetadataRoute.Sitemap = [
    "",
    "/skills",
    "/vibes",
    "/forum",
    "/blog",
    "/cli",
    "/mcp",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: today,
    changeFrequency: "daily" as const,
    priority: route === "" ? 1.0 : 0.8,
  }));

  // Pull community-submitted content so detail pages are crawlable. The Agents
  // section is demoted, so feed-worthy rows are crawled under their feed type:
  // CLIs at /cli, MCP servers at /mcp. Host rows are excluded by the
  // data layer and intentionally not surfaced.
  const [skills, projects, clis, mcpServers, posts, threads] = await Promise.all([
    getSkills(),
    getProjects(),
    getCli(),
    getAgents(undefined, "MCP Server"),
    getBlogPosts(),
    getThreads(),
  ]);

  // Showcase and blog detail pages carry user-generated content that is more
  // likely to attract external links — bump their priority to signal freshness.
  const highValueDetails: MetadataRoute.Sitemap = [
    ...projects.map((p) => `/vibes/${p.id}`),
    ...posts.map((b) => `/blog/${b.id}`),
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: today,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const standardDetails: MetadataRoute.Sitemap = [
    ...TOPIC_SLUGS.map((slug) => `/skills/topic/${slug}`),
    ...skills.map((s) => `/skills/${s.id}`),
    ...clis.map((a) => `/cli/${a.id}`),
    ...mcpServers.map((a) => `/mcp/${a.id}`),
    ...threads.map((t) => `/forum/${t.id}`),
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: today,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...highValueDetails, ...standardDetails];
}
