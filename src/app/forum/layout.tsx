import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Forum",
  description: "Spørg om AI. Få svar fra folk der bygger.",
  path: "/forum",
  image: "/images/og-default.jpg",
});

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
