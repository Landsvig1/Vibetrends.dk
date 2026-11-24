import { unstable_rethrow } from "next/navigation";
import { countRealBlogPosts, countRealThreads } from "@/lib/db";

/**
 * Whether a hub has anything behind it. Three places depend on this answer —
 * the sitemap's hub entry, the hub's robots meta, and the header nav — and they
 * have to agree. They didn't when only the sitemap discounted e2e fixture rows:
 * a build inside a CI seed window rendered /forum indexable while the sitemap
 * still omitted it. The fixture exclusion now lives in the count query itself
 * (countRealRows in lib/db.ts), so there is no per-call-site filter to forget.
 *
 * (Sitemap *detail* URLs still filter rows directly with isE2eFixtureId —
 * that's a different question: which rows to list, not whether the hub exists.)
 *
 * These return true when the hub has content, and true when we couldn't tell.
 * Failing open is deliberate. Every consumer makes a hub *less* visible when it
 * reads false: noindex, dropped from the sitemap, unlinked from the nav. Those
 * decisions are memoized by `'use cache'` with cacheLife('max') and are usually
 * taken at build time, so one failed read during a deploy would otherwise
 * deindex a populated hub and leave it that way until a write revalidated the
 * tag.
 *
 * Neither direction is free, and the bad case for failing open is worse than
 * "briefly indexable":
 *   - Wrongly "empty" on a live hub: deindexed and unlinked, and recovery waits
 *     on Google re-crawling. Slow, and outside our control.
 *   - Wrongly "has content" on an empty hub: the hub is indexable and listed
 *     while its own list read most likely failed in the same window — and
 *     getThreads/getBlogPosts DO cache their `[]` at cacheLife('max'). So this
 *     is a thin indexable page that persists until a write revalidates, not one
 *     that self-heals on the next read.
 *
 * It is still the better side to land on: a thin page can be fixed by a
 * redeploy, a deindexed one waits on a crawler. But it is a real cost, not a
 * free choice. countRealThreads/countRealBlogPosts throw rather than returning
 * 0 precisely so this decision is made here instead of hidden in a swallowed
 * error.
 */
export async function hasForumContent(): Promise<boolean> {
  try {
    return (await countRealThreads()) > 0;
  } catch (err) {
    // cacheComponents is on (next.config.ts), and Next signals a prerender
    // bail-out by throwing. A bare catch would swallow that and bake "this hub
    // has content" into the build instead of letting Next handle it — the same
    // class of silent wrong answer this module exists to prevent.
    unstable_rethrow(err);
    return true;
  }
}

/** See hasForumContent — same fail-open reasoning, same bail-out rethrow. */
export async function hasBlogContent(): Promise<boolean> {
  try {
    return (await countRealBlogPosts()) > 0;
  } catch (err) {
    unstable_rethrow(err);
    return true;
  }
}

/**
 * Nav hrefs (header and footer) to hide.
 *
 * This is deliberately NOT the same question as hasForumContent/hasBlogContent.
 * Those two decide indexing — the sitemap entry and the hub's robots meta — and
 * nothing here changes that.
 *
 *   - /blog is author-only. No visitor can populate it, so hiding an empty blog
 *     costs nothing and spares the visitor a dead link. It stays gated on its own
 *     content: createBlogPost/deleteBlogPost revalidate HUB_EMPTINESS_TAG, so the
 *     first post brings the link back on the same trigger that puts the hub in
 *     the sitemap and drops its noindex.
 *
 *   - /forum is hidden unconditionally. The owner decided on 2026-11-23 to keep
 *     it out of the nav until it has been seeded, after an always-visible forum
 *     sat at one thread and zero replies for months. The route, its threads and
 *     the MCP search_forum tool stay live; only the entry points go. Showing it
 *     again is an owner decision, not a content threshold: drop FORUM_HIDDEN.
 *
 * A row inserted out of band — a node script against DATABASE_URL, a migration,
 * the Supabase dashboard — touches no tag, and the count is cacheLife('max'), so
 * the blog stays hidden and noindexed until something revalidates. getSkillDoc
 * (db.ts) documents the same trap. If you seed content by hand, revalidate or
 * redeploy afterwards.
 */
export const FORUM_HIDDEN: boolean = true;

export async function hiddenNavHrefs(): Promise<string[]> {
  const hidden: string[] = FORUM_HIDDEN ? ["/forum"] : [];
  if (!(await hasBlogContent())) hidden.push("/blog");
  return hidden;
}
