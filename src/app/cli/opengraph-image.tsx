import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk CLI-værktøjer";

export default async function Image() {
  return renderOgImage("CLI", "CLI-værktøjer", "CLI-tools din agent kan kalde direkte. Kuraterede og testede.");
}
