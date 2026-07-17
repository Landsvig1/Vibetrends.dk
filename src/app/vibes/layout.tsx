import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Project Showcase",
  description: "Se hvad Danmark bygger med AI. Bliv inspireret, og vis dit eget frem.",
  path: "/vibes",
  image: "/images/og-default.jpg",
});

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
