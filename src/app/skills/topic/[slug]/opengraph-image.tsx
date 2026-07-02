import { getSkillCategory } from "@/lib/skillCategories";
import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk skills topic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = getSkillCategory(slug);
  return renderOgImage("Skills", topic ? `${topic.labelEn} skills` : "Skills Library");
}
