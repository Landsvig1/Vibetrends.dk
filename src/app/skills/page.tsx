import { Suspense } from "react";
import { getSkills, SkillView } from "@/lib/db";
import { jsonLdScript, skillsListJsonLd } from "@/lib/jsonLd";
import SkillsLoading from "./loading";
import SkillsExplorer from "./SkillsExplorer";
import SkillTopicIndex from "./SkillTopicIndex";
import AgentSurfaceStrip from "../components/AgentSurfaceStrip";
import { countByCategory } from "@/lib/skillCategories";

/** Re-exported so the route's own tests and callers keep one import path; the
 * implementation lives in lib so the client island can share it. */
export { getValidView } from "@/lib/skillViews";

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
 * Fetches every board this page can show, up front and concurrently:
 *   1. Full catalog, unfiltered — the "Alle" board, the search corpus, the
 *      per-topic counts, and the empty-state fallbacks.
 *   2. The Dansk board.
 *   3. The Trender board.
 *   4. The search-filtered catalog, only when ?q= is set, and only to keep the
 *      JSON-LD honest about what the page is actually listing.
 *
 * All four are `use cache` reads with cacheLife('max'), so fetching three
 * boards instead of one costs a warm cache lookup rather than three queries.
 * Buying all of them here is what lets the client switch tabs with no network
 * round-trip, print a real count on every tab, and drop the refetch whose only
 * failure handler was a console.error behind an unchanged grid.
 *
 * The catalog read is deliberately NOT filtered by ?q=. It used to be, which
 * meant that on any URL carrying a search term the client island received an
 * empty catalog — so the zero-results state lost its suggestions on exactly
 * the URLs people share and reload. Search itself runs client-side in
 * filterSkills(), against this list.
 *
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
  const resolvedParams = await searchParams;
  // `?view=` is not read here any more: every board is fetched regardless, and
  // the client island validates the param with the same getValidView().
  const search = resolvedParams?.q || undefined;

  const [allSkills, danishSkills, trendingSkills, searchedSkills] =
    await Promise.all([
      getSkills(undefined, undefined, 'da'),
      getSkills(undefined, undefined, 'da', 'danish' satisfies SkillView),
      getSkills(undefined, undefined, 'da', 'trending' satisfies SkillView),
      // JSON-LD only. When ?q= is present (human search box or ?format=json
      // agent call) the page lists the filtered result, so the structured data
      // has to say so rather than describing the whole catalog.
      search ? getSkills(search, undefined, 'da') : Promise.resolve(null),
    ]);

  // Build JSON-LD server-side from real rows so crawlers see it in the initial
  // response. Previously this was built from client state that starts empty —
  // every crawler saw numberOfItems: 0.
  const jsonLd = skillsListJsonLd(
    searchedSkills ?? allSkills,
    "Skills-biblioteket",
    "Et bibliotek af gratis AI-skills, workflows og scripts delt af det danske community.",
  );

  const topicCounts = countByCategory(allSkills);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <div className="space-y-12 sm:space-y-14">
        <SkillsExplorer
          initialAllSkills={allSkills}
          initialDanishSkills={danishSkills}
          initialTrendingSkills={trendingSkills}
        />
        <SkillTopicIndex counts={topicCounts} />
        <AgentSurfaceStrip hub="skills" />
      </div>
    </>
  );
}
