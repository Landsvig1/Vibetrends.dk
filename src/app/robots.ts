import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://vibetrends.dk";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/mcp", "/api/skills", "/api/feed"],
      disallow: "/api/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
