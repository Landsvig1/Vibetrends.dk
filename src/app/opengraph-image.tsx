import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk: AI-tools til dig og dine agenter";

export default async function Image() {
  return renderOgImage(
    "Hub",
    "Gode AI-tools. Selv agenter henter dem her.",
    "Skills, MCP-servere og CLI-tools der virker. Verdens bedste, plus dem kun Danmark har."
  );
}
