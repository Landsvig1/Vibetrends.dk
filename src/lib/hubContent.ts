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
 * Header nav hrefs to hide while their hub has nothing in it.
 *
 * This is deliberately NOT the same question as hasForumContent/hasBlogContent,
 * even though it used to be answered by them. Those two still decide indexing —
 * the sitemap entry and the hub's robots meta — and nothing here changes that:
 * an empty hub stays out of the sitemap and stays noindexed, because a thin page
 * in the index is a real SEO cost.
 *
 * Visibility in the nav is a different trade, and the two hubs answer it
 * differently:
 *
 *   - /blog is author-only. No visitor can populate it, so hiding an empty blog
 *     costs nothing and spares the visitor a dead link. It stays gated.
 *
 *   - /forum is the only hub a *visitor* can fill. Gating it on its own content
 *     is self-sealing: the surface that would produce the first thread is hidden
 *     until a first thread exists, so it can never start. PRODUCT.md names
 *     community traction as the success metric and an inert catalog as a failure
 *     state, which makes "never show the community surface" the more expensive
 *     side of this trade — more expensive than the dead-link impression the
 *     gating was added to avoid.
 *
 * The empty forum is therefore designed rather than hidden: ForumExplorer's
 * zero-thread state is an authored invitation tied to real catalog content, not
 * a blank list. That is what makes showing the link honest instead of a bait.
 *
 * Everything the old gating bought is preserved for /blog, including the
 * revalidation behavior: createBlogPost/deleteBlogPost revalidate
 * HUB_EMPTINESS_TAG, so a post created through the site or the API brings the
 * link back on the same trigger that puts the hub in the sitemap and drops its
 * noindex. Upvotes and replies deliberately do not — see the tag's definition in
 * db.ts for why it isn't just 'threads-list'.
 *
 * A row inserted out of band — a node script against DATABASE_URL, a migration,
 * the Supabase dashboard — touches no tag, and the count is cacheLife('max'), so
 * the blog stays hidden and noindexed until something revalidates. getSkillDoc
 * (db.ts) documents the same trap. If you seed content by hand, revalidate or
 * redeploy afterwards.
 */
export async function hiddenNavHrefs(): Promise<string[]> {
  const blogHasContent = await hasBlogContent();

  return blogHasContent ? [] : ["/blog"];
}
