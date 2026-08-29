import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk forum";

export default async function Image() {
  return renderOgImage("Forum", "Forum", "Spørgsmål, svar og erfaringer fra danske AI-byggere.");
}
