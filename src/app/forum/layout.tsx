import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Developer Forum",
  description: "Stil spørgsmål, del prompts og diskuter de nyeste AI-modeller med andre danske vibe coders.",
  path: "/forum",
});

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
