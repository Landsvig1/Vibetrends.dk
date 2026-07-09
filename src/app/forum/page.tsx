import { Suspense } from "react";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { getThreads } from "@/lib/db";
import { jsonLdScript } from "@/lib/jsonLd";
import ForumLoading from "./loading";
import ForumExplorer from "./ForumExplorer";

/**
 * Validates the `view` URL param to the three tabs ForumExplorer renders
 * (Dansk/Top/Nyeste). Default is "danish" — same default-to-Dansk pattern as
 * /skills, /cli, /mcp, and /agents. Exported for unit testing.
 */
export function getValidForumView(view: string | undefined): "danish" | "top" | "new" {
  if (view === "top" || view === "new") return view;
  return "danish";
}

/**
 * Outer server component — wraps the data-fetch layer in a Suspense boundary
 * so loading.tsx is streamed as the fallback on a cache-miss rather than
 * blocking or showing nothing.
 */
export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; view?: string }>;
}) {
  return (
    <Suspense fallback={<ForumLoading />}>
      <ForumPageContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Inner async server component — separated from the outer route shell so that
 * cookies() (a dynamic API) is called inside its own Suspense boundary, not
 * inside a cached parent component. This is the established pattern used by
 * every detail page in this codebase (forum/[id], agents/[id], etc. — see
 * KTD4 in docs/plans/2026-07-08-001-feat-site-wide-performance-seo-optimization-plan.md).
 *
 * Reads lang from cookie, calls the cached getThreads() (U1/U2), respects
 * category and view from searchParams, builds the JSON-LD ItemList/
 * DiscussionForumPosting server-side from real data (fixing the SEO gap
 * where the forum hub had no JSON-LD at all — the layout only supplies static
 * metadata, not structured list data), then delegates all interactivity to
 * the client island.
 *
 * getThreads() only understands top/new — the Dansk tab is a client-side
 * filter/sort layered on top of the 'top'-sorted base list (same pattern as
 * VibesExplorer's Dansk/Alle/Hot), so "danish" and "top" both fetch with
 * server sort 'top'.
 *
 * Exported for unit testing.
 */
export async function ForumPageContent({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; view?: string }>;
}) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const resolvedParams = await searchParams;
  const view = getValidForumView(resolvedParams?.view);
  const serverSort = view === "new" ? "new" : "top";
  // Only pass category to the query when it's not "All" — getThreads uses
  // undefined to mean "no category filter" (returns all categories).
  const category =
    resolvedParams?.category && resolvedParams.category !== "All"
      ? resolvedParams.category
      : undefined;

  // Cached read — getThreads() is wrapped with "use cache" + cacheTag in db.ts
  // (U1/U2). On cache-hit this is free; on cache-miss it queries Supabase and
  // stores the result. The Suspense fallback (loading.tsx) covers the miss.
  // The batched reply fetch (thread_replies .in('thread_id', threadIds)) runs
  // inside getThreads — reply counts are populated server-side.
  const threads = await getThreads(undefined, category, lang, undefined, serverSort);

  // Build the JSON-LD server-side from real data so crawlers see it in the
  // initial response. Previously the forum hub had NO JSON-LD at all — the
  // layout.tsx only supplies static metadata, and the page was pure client-side.
  // Using ItemList wrapping DiscussionForumPosting entries matches the
  // schema.org pattern for a forum listing page.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Developer Forum",
    description:
      "Stil spørgsmål, del prompts og diskuter de nyeste AI-modeller med andre danske vibe coders.",
    numberOfItems: threads.length,
    itemListElement: threads.map((thread, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "DiscussionForumPosting",
        headline: thread.title,
        author: {
          "@type": "Person",
          name: thread.author,
        },
        url: `https://vibetrends.dk/forum/${thread.id}`,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <ForumExplorer
        initialThreads={threads}
        initialView={view}
        initialCategory={resolvedParams?.category ?? "All"}
      />
    </>
  );
}
