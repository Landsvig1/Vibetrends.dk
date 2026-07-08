import { Suspense } from "react";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { getProjects } from "@/lib/db";
import { jsonLdScript } from "@/lib/jsonLd";
import ShowcaseLoading from "./loading";
import VibesExplorer from "./VibesExplorer";

/**
 * Outer server component — wraps the data-fetch layer in a Suspense boundary
 * so loading.tsx is streamed as the fallback on a cache-miss rather than
 * blocking or showing nothing.
 */
export default async function VibesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
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
 * Reads lang from cookie, calls the cached getProjects() (U1/U2), builds the
 * JSON-LD ItemList server-side (fixing the SEO gap where it was previously
 * built from client state that starts empty), then delegates all
 * interactivity to the client island.
 *
 * Always fetches the full catalog sorted 'top' (upvotes desc) — the
 * Dansk/Alle/Hot tabs are purely client-side filter/sort operations on this
 * base list (same pattern as AgentsExplorer's Dansk/Alle/Hot tabs), so there's
 * no per-view server round-trip on first paint.
 *
 * Exported for unit testing.
 */
export async function VibesPageContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const resolvedParams = await searchParams;
  const search = resolvedParams?.q || undefined;

  // Cached read — getProjects() is wrapped with "use cache" + cacheTag in db.ts
  // (U1/U2). On cache-hit this is free; on cache-miss it queries Supabase and
  // stores the result. The Suspense fallback (loading.tsx) covers the miss.
  // When ?q= is present (human search box or ?format=json agent call), pass it
  // through so the server-rendered result and JSON-LD reflect the filtered list.
  const projects = await getProjects(search, lang, "top");

  // Build the JSON-LD server-side from real data so crawlers see it in the
  // initial response. Previously this was built from filteredProjects client
  // state that starts empty — every crawler saw numberOfItems:0.
  // When ?q= is set the projects list is already filtered — numberOfItems and
  // itemListElement automatically reflect the narrowed result.
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
