import { Suspense } from "react";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { getSkills, SkillView } from "@/lib/db";
import { jsonLdScript, skillsListJsonLd } from "@/lib/jsonLd";
import SkillsLoading from "./loading";
import SkillsExplorer from "./SkillsExplorer";

/**
 * Validates the `view` URL param to the four values the skills page supports.
 * "all" is the topic-cards view (no viewSkills grid).
 * Exported for unit testing.
 */
export function getValidView(view: string | undefined): string {
  if (
    view === "danish" ||
    view === "hot" ||
    view === "trending" ||
    view === "all"
  )
    return view;
  return "danish";
}

/**
 * Outer server component — wraps the data-fetch layer in a Suspense boundary
 * so loading.tsx is streamed as the fallback on a cache-miss rather than
 * blocking or showing nothing.
 */
export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  return (
    <Suspense fallback={<SkillsLoading />}>
      <SkillsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Inner async server component — separated from the outer route shell so that
 * cookies() (a dynamic API) is called inside its own Suspense boundary, not
 * inside a cached parent component. This is the established pattern used by
 * every detail page in this codebase (skills/[id], agents/[id], etc. — see
 * KTD4 in docs/plans/2026-07-08-001-feat-site-wide-performance-seo-optimization-plan.md).
 *
 * Reads lang from cookie, calls the cached getSkills() twice:
 *   1. Full catalog (no view) — drives search and per-topic counts.
 *   2. View-specific board (danish/hot/trending) — the initial grid.
 * Builds JSON-LD server-side from real data (fixing the SEO gap where it was
 * previously built from client state that starts empty), then delegates all
 * interactivity to the client island.
 *
 * Exported for unit testing.
 */
export async function SkillsPageContent({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const resolvedParams = await searchParams;
  const view = getValidView(resolvedParams?.view);
  const search = resolvedParams?.q || undefined;

  // Full catalog and the view-specific board are independent cached reads —
  // fetch them concurrently rather than sequentially.
  // When ?q= is present (human search box or ?format=json agent call), pass it
  // through so both fetches and the JSON-LD reflect the filtered result.
  const skillView = view !== "all" ? (view as SkillView) : undefined;
  const [allSkills, initialViewSkills] = await Promise.all([
    // Drives client-side search and per-topic counts for the topic cards.
    // No view arg → all skills ordered by upvotes (filtered by search if set).
    getSkills(search, undefined, lang),
    // Only fetched when the initial view is a board view, not the topic-cards
    // "all" view (which uses the full catalog for counts).
    skillView ? getSkills(search, undefined, lang, skillView) : Promise.resolve([]),
  ]);

  // Build JSON-LD server-side from the full catalog so crawlers see it in the
  // initial response. Previously this was built from client state that starts
  // empty — every crawler saw numberOfItems: 0.
  const jsonLd = skillsListJsonLd(
    allSkills,
    "Community Skills Bibliotek",
    "Et bibliotek af gratis AI-skills, workflows og scripts delt af det danske community.",
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <SkillsExplorer
        initialAllSkills={allSkills}
        initialViewSkills={initialViewSkills}
      />
    </>
  );
}
