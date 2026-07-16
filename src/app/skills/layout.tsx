import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Skills Library",
  description: "AI-skills der virker. Verdens bedste, plus dem kun Danmark har: Rejseplanen, Boliga, CVR. Din agent kan selv hente dem.",
  path: "/skills",
  image: "/images/og-default.jpg",
});

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
