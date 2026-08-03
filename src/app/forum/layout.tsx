import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";
import { getThreads } from "@/lib/db";
import { hasRealContent } from "@/lib/hubContent";

export async function generateMetadata(): Promise<Metadata> {
  // An empty hub is a thin page — don't ask to have it indexed. `follow` stays
  // on so the nav links out of it still carry crawl signal. Reverses itself:
  // the first thread makes this indexable again, and puts /forum back in the
  // sitemap. The flag is inherited by /forum/[id], which is harmless — zero
  // threads means zero detail routes.
  //
  // Emptiness is decided by hasRealContent (src/lib/hubContent.ts) so this, the
  // sitemap, and the header nav can't drift apart on what counts as a row.
  const hasThreads = hasRealContent(await getThreads());

  return entityMetadata({
    title: "Forum",
    description: "Spørg om AI. Få svar fra folk der bygger.",
    path: "/forum",
    image: "/images/og-default.jpg",
    ...(hasThreads ? {} : { robots: { index: false, follow: true } }),
  });
}

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
