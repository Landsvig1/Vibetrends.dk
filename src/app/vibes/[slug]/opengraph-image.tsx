import { getProjectBySlug } from "@/lib/db";
import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk showcase project";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return renderOgImage("Showcase", project?.title ?? "vibetrends.dk", project?.description);
}
