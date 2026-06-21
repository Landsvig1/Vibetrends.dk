import { getTopic } from "@/lib/topics";
import { renderOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const size = ogSize;
export const contentType = ogContentType;
export const alt = "vibetrends.dk skills topic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = getTopic(slug);
  return renderOgImage("Skills", topic ? `${topic.labelEn} skills` : "Skills Library");
}
