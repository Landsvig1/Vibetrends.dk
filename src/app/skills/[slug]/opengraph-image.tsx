import { getSkillBySlug } from "@/lib/db";
import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk skill";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const skill = await getSkillBySlug(slug, "da");
  return renderOgImage("Skills", skill?.title ?? "vibetrends.dk", skill?.description);
}
