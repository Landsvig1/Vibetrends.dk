import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk blog";

export default async function Image() {
  return renderOgImage("Blog", "Blog", "Artikler om AI-tools, agenter og vibe coding, på dansk.");
}
