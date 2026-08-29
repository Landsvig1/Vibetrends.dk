import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk MCP-servere";

export default async function Image() {
  return renderOgImage("MCP", "MCP-servere", "Fra Aula og CVR til verdens bedste agent-tools. Connect-opskrift følger med.");
}
