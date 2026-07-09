import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Skills Library",
  description: "Et bibliotek af gratis AI-skills, workflows og scripts delt af det danske community — klar til at koble på din coding agent.",
  path: "/skills",
  image: "/images/og-default.jpg",
});

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
