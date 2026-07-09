import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Project Showcase",
  description: "Se hvad folk bygger med AI. Vibe-kodede projekter fra det danske community — med tech stacks, prompts og live demos.",
  path: "/vibes",
  image: "/images/og-default.jpg",
});

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
