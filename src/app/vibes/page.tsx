import { Suspense } from "react";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { getProjects } from "@/lib/db";
import { jsonLdScript } from "@/lib/jsonLd";
import ShowcaseLoading from "./loading";
import VibesExplorer from "./VibesExplorer";

/**
 * Validates the `sort` URL param to the three values getProjects() accepts.
 * Exported for unit testing.
 */
export function getValidSort(sort: string | undefined): "top" | "new" | "az" {
  if (sort === "top" || sort === "az") return sort;
  return "new";
}

/**
 * Outer server component — wraps the data-fetch layer in a Suspense boundary
 * so loading.tsx is streamed as the fallback on a cache-miss rather than
 * blocking or showing nothing.
 */
export default async function VibesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  return (
    <Suspense fallback={<ShowcaseLoading />}>
      <VibesPageContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Inner async server component — separated from the outer route shell so that
 * cookies() (a dynamic API) is called inside its own Suspense boundary, not
 * inside a cached parent component. This is the established pattern used by
 * every detail page in this codebase (vibes/[id], agents/[id], etc. — see
 * KTD4 in docs/plans/2026-07-08-001-feat-site-wide-performance-seo-optimization-plan.md).
 *
 * Reads lang from cookie, calls the cached getProjects(), builds the JSON-LD
 * ItemList server-side (fixing the SEO gap where it was previously built from
 * client state that starts empty), then delegates all interactivity to the
 * client island.
 *
 * Exported for unit testing.
 */
export async function VibesPageContent({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const resolvedParams = await searchParams;
  const sort = getValidSort(resolvedParams?.sort);

  // Cached read — getProjects() is wrapped with "use cache" + cacheTag in db.ts
  // (U1/U2). On cache-hit this is free; on cache-miss it queries Supabase and
  // stores the result. The Suspense fallback (loading.tsx) covers the miss.
  const projects = await getProjects(undefined, lang, sort);

  // Build the JSON-LD server-side from real data so crawlers see it in the
  // initial response. Previously this was built from filteredProjects client
  // state that starts empty — every crawler saw numberOfItems:0.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Vibe Coding Project Showcase",
    "description":
      "Showcase af innovative softwareprojekter og værktøjer bygget ved hjælp af AI.",
    "numberOfItems": projects.length,
    "itemListElement": projects.map((project, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "SoftwareApplication",
        "name": project.title,
        "description": project.description,
        "applicationCategory": "DeveloperApplication",
        "author": {
          "@type": "Person",
          "name": project.author,
        },
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
        },
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <VibesExplorer initialProjects={projects} />
    </>
  );
}
