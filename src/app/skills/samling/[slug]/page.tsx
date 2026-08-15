import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Library } from "lucide-react";
import { getCollection } from "@/lib/db";
import { entityMetadata } from "@/lib/seo";
import { jsonLdScript, skillsListJsonLd } from "@/lib/jsonLd";
import { CollectionList } from "./CollectionList";

// No generateStaticParams: collections change when the catalog does, and the
// set is small enough that the sitemap is the crawl path. Matches the topic
// hub next door.

function collectionDescription(title: string, count: number) {
  return `${count} skills fra ${title}, samlet ét sted. Hver skill installeres for sig.`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getCollection(slug, "da");
  if (!collection) return { title: "Samling ikke fundet" };

  return entityMetadata({
    title: collection.title,
    suffix: " - Samling i Skills-biblioteket",
    description: collectionDescription(collection.title, collection.skills.length),
    path: `/skills/samling/${slug}`,
    lang: "da",
  });
}

export default function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-10 animate-pulse">
          <div className="h-6 w-24 rounded bg-card-border/50"></div>
          <div className="h-40 rounded-2xl glass-panel border border-card-border bg-card-border/10"></div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="h-48 rounded-xl glass-card bg-card-border/10"></div>
            <div className="h-48 rounded-xl glass-card bg-card-border/10"></div>
          </div>
        </div>
      }
    >
      <CollectionContent params={params} />
    </Suspense>
  );
}

async function CollectionContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Null covers both an unknown slug and a one-member collection: a lone
  // import gets no page, so grouping never renders as a one-item folder.
  const collection = await getCollection(slug, "da");
  if (!collection) notFound();

  const { title, skills } = collection;
  const description = collectionDescription(title, skills.length);

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(skillsListJsonLd(skills, title, description)),
        }}
      />

      <Link
        href="/skills"
        className="flex items-center text-sm font-semibold text-text-secondary transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Skills-biblioteket
      </Link>

      <div className="flex flex-col gap-6 rounded-2xl glass-panel border border-card-border p-8 sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent-primary">
          <Library className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
              {title}
            </h1>
            <span className="rounded border border-card-border bg-background px-2 py-0.5 font-mono text-xs text-text-secondary">
              {skills.length} skills
            </span>
          </div>
          {/* The point of the page, said plainly: a collection is where these
              came from, not a bundle you install in one go. */}
          <p className="max-w-2xl text-text-secondary">
            Skills fra det samme repo. De hører sammen, men installeres hver for sig.
          </p>
        </div>
      </div>

      {/* Flat and alphabetical, never grouped by category. Three of the real
          collections sit in a single category, so grouping would be a heading
          with extra steps, and it would key off a taxonomy that is already
          slated to be remapped. */}
      <CollectionList skills={skills} githubLabel="Se på GitHub" connectLabel="Forbind" />
    </div>
  );
}
