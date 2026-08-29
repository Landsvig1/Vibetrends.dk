import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk skills-bibliotek";

export default async function Image() {
  return renderOgImage("Skills", "Skills-biblioteket", "Agent-skills der virker. Kuraterede, testede og klar til at hente.");
}
