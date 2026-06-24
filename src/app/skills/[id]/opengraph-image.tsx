import { getSkillById } from "@/lib/db";
import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk skill";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await getSkillById(id, "da");
  return renderOgImage("Skills Library", skill?.title ?? "vibetrends.dk");
}
