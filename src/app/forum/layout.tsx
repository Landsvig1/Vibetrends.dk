import type { Metadata } from "next";
import { entityMetadata } from "@/lib/seo";
import { getThreads, isE2eFixtureId } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  // An empty hub is a thin page — don't ask to have it indexed. `follow` stays
  // on so the nav links out of it still carry crawl signal. Reverses itself:
  // the first thread makes this indexable again, and puts /forum back in the
  // sitemap. The flag is inherited by /forum/[id], which is harmless — zero
  // threads means zero detail routes.
  //
  // Fixture rows are discounted for the same reason sitemap.ts discounts them:
  // the two must agree on emptiness. They didn't when only the sitemap
  // filtered, so a build inside a CI seed window rendered /forum indexable
  // while the sitemap still omitted it.
  const threads = (await getThreads()).filter((t) => !isE2eFixtureId(t.id));

  return entityMetadata({
    title: "Forum",
    description: "Spørg om AI. Få svar fra folk der bygger.",
    path: "/forum",
    image: "/images/og-default.jpg",
    ...(threads.length === 0 ? { robots: { index: false, follow: true } } : {}),
  });
}

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
