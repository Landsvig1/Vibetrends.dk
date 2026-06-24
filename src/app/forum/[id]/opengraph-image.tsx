import { getThreadById } from "@/lib/db";
import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk forum thread";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = await getThreadById(id, "da");
  return renderOgImage("Forum", thread?.title ?? "vibetrends.dk");
}
