import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk vibes";

export default async function Image() {
  return renderOgImage("Vibes", "Se hvad Danmark bygger med AI", "Bliv inspireret, og vis dit eget frem.");
}
