import { MetadataRoute } from "next";
import { getSkills, getProjects, getAgents, getBlogPosts, getThreads } from "@/lib/db";
import { TOPIC_SLUGS } from "@/lib/topics";

const baseUrl = "https://vibetrends.dk";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const today = new Date().toISOString().split("T")[0];

  const staticEntries: MetadataRoute.Sitemap = [
    "",
    "/skills",
    "/showcase",
    "/forum",
    "/blog",
    "/agents",
    "/mcp",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: today,
    changeFrequency: "daily" as const,
    priority: route === "" ? 1.0 : 0.8,
  }));

  // Pull community-submitted content so detail pages are crawlable. getAgents()
  // excludes MCP servers (they live under /mcp), so fetch those separately.
  const [skills, projects, agents, mcpServers, posts, threads] = await Promise.all([
    getSkills(),
    getProjects(),
    getAgents(),
    getAgents(undefined, "MCP Server"),
    getBlogPosts(),
    getThreads(),
  ]);

  const detailEntries: MetadataRoute.Sitemap = [
    ...TOPIC_SLUGS.map((slug) => `/skills/topic/${slug}`),
    ...skills.map((s) => `/skills/${s.id}`),
    ...projects.map((p) => `/showcase/${p.id}`),
    ...agents.map((a) => `/agents/${a.id}`),
    ...mcpServers.map((a) => `/mcp/${a.id}`),
    ...posts.map((b) => `/blog/${b.id}`),
    ...threads.map((t) => `/forum/${t.id}`),
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: today,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...detailEntries];
}
