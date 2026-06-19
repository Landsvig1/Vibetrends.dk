import { getBlogPostById } from "@/lib/db";
import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk blog article";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBlogPostById(id);
  return renderOgImage("Blog", post?.title ?? "vibetrends.dk");
}
