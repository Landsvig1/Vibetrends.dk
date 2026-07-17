import { getFeedItems } from "@/lib/db";

/** Escapes the five XML-special characters for safe element/attribute text. */
function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const TYPE_LABELS: Record<string, string> = {
  skill: "Skill",
  mcp: "MCP Server",
  cli: "CLI Tool",
  vibe: "Showcase",
};

/**
 * GET /feed.xml — RSS 2.0 rendering of the market feed (/api/feed).
 * `?lang=en` switches item language; Danish is the default, as everywhere.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get("lang") === "en" ? "en" as const : "da" as const;

  const items = await getFeedItems({ lang, limit: 30 });

  const description =
    lang === "da"
      ? "Nyt på det danske AI-marked: skills, MCP-servere, CLI-tools og projekter fra vibetrends.dk"
      : "New in the Danish AI market: skills, MCP servers, CLI tools, and projects from vibetrends.dk";

  const rssItems = items
    .map(
      i => `    <item>
      <title>${xml(`${TYPE_LABELS[i.type] ?? i.type}: ${i.title}`)}</title>
      <link>${xml(i.url)}</link>
      <guid isPermaLink="true">${xml(i.url)}</guid>
      <description>${xml(i.summary)}</description>
      <category>${xml(i.type)}</category>
      <pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>
    </item>`
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>vibetrends.dk</title>
    <link>https://vibetrends.dk</link>
    <atom:link href="https://vibetrends.dk/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xml(description)}</description>
    <language>${lang === "da" ? "da-DK" : "en"}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Shared-cacheable for 10 minutes: RSS readers poll aggressively and the
      // feed only changes when content is published — unlike upvote counts,
      // a briefly stale window here is harmless.
      "Cache-Control": "public, max-age=600",
    },
  });
}
