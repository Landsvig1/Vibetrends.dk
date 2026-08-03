import { Suspense } from "react";
import BlogList from "./BlogList";
import { BookOpen } from "lucide-react";
import { entityMetadata } from "@/lib/seo";
import { getBlogPosts, isE2eFixtureId } from "@/lib/db";

export async function generateMetadata() {
  // An empty hub is a thin page — don't ask to have it indexed. `follow` stays
  // on so the nav links out of it still carry crawl signal. Reverses itself:
  // the first published post makes this indexable again, and puts /blog back
  // in the sitemap.
  //
  // The e2e seed doesn't touch blog_posts today, but filter anyway so this
  // can't start disagreeing with the sitemap if that ever changes.
  const posts = (await getBlogPosts()).filter((b) => !isE2eFixtureId(b.id));

  return entityMetadata({
    title: "Blog",
    description: "Guides, tutorials og dybdegående artikler om hvordan du maksimerer dit AI-workflow.",
    path: "/blog",
    lang: "da",
    ...(posts.length === 0 ? { robots: { index: false, follow: true } } : {}),
  });
}

export default async function BlogPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-4 text-center md:text-left">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Vibe Trends <span className="text-accent-primary">Blog</span>
        </h1>
        <p className="text-text-secondary max-w-2xl">
          Guides, tutorials og dybdegående artikler om hvordan du maksimerer dit AI-workflow, opsætter agenter og vibe koder projekter.
        </p>
      </div>

      <Suspense fallback={
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-text-secondary animate-pulse mx-auto mb-4" />
          <p className="text-text-secondary">Henter artikler...</p>
        </div>
      }>
        <BlogList />
      </Suspense>
    </div>
  );
}
