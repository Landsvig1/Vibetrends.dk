import { countRealBlogPosts, countRealThreads } from "@/lib/db";

/**
 * A hub counts as empty until it has at least one non-fixture row.
 *
 * e2e fixture rows (scripts/seed-e2e-fixtures.mjs) are short-lived and must
 * never make a hub look populated. Three places depend on this answer — the
 * sitemap's hub entry, the hub's robots meta, and the header nav — and they
 * have to agree. They didn't when only the sitemap filtered fixtures: a build
 * inside a CI seed window rendered /forum indexable while the sitemap still
 * omitted it. The fixture exclusion now lives in the count query itself
 * (countRealRows in lib/db.ts), so there is no per-call-site filter to forget.
 *
 * (Sitemap *detail* URLs still filter rows directly with isE2eFixtureId —
 * that's a different question: which rows to list, not whether the hub exists.)
 */

/**
 * True when the hub has real content, and true when we couldn't tell.
 *
 * Failing open is deliberate and asymmetric. Every consumer of this answer
 * makes a hub *less* visible when it reads false: noindex on the hub, dropped
 * from the sitemap, unlinked from the nav. Those decisions are memoized by
 * `'use cache'` with cacheLife('max') and are usually taken at build time, so
 * one failed read during a deploy would otherwise deindex a populated hub and
 * leave it that way until a write happened to revalidate the tag.
 *
 * The two failure directions are not symmetric:
 *   - Wrongly "empty" on a live hub: deindexed and unlinked. Recovering means
 *     waiting for Google to re-crawl, which is slow and outside our control.
 *   - Wrongly "has content" on an empty hub: one thin page briefly indexable.
 *     The next successful read reverses it.
 *
 * The second is cheaper, so that's the way this falls. countRealThreads and
 * countRealBlogPosts throw rather than returning 0 precisely so this choice
 * can be made here instead of being hidden inside a swallowed error.
 */
export async function hasForumContent(): Promise<boolean> {
  try {
    return (await countRealThreads()) > 0;
  } catch {
    return true;
  }
}

/** See hasForumContent — same fail-open reasoning. */
export async function hasBlogContent(): Promise<boolean> {
  try {
    return (await countRealBlogPosts()) > 0;
  } catch {
    return true;
  }
}

/**
 * Header nav hrefs to hide while their hub has nothing in it. A visitor who
 * clicks "Forum" and lands on zero threads reads the whole site as dead, which
 * costs more than the link is worth.
 *
 * The routes stay live and reachable: agents read and post through /api/forum
 * and /api/blog, the MCP endpoint and /agent-guide document them, and the
 * footer still links both. Only the header stops advertising them.
 *
 * Reverses itself for writes that go through createThread/createBlogPost:
 * those are the only callers of revalidateTag('threads-list') and
 * revalidateTag('blog-posts'), so a thread or post created through the site or
 * the API brings the link back on the same trigger that puts the hub back in
 * the sitemap and drops its noindex.
 *
 * A row inserted out of band — a node script against DATABASE_URL, a migration,
 * the Supabase dashboard — touches no tag, and both counts are cacheLife('max').
 * The hub then stays hidden and noindexed until something revalidates.
 * getSkillDoc (db.ts) documents the same trap. If you seed content by hand,
 * revalidate or redeploy afterwards.
 */
export async function hiddenNavHrefs(): Promise<string[]> {
  const [forumHasContent, blogHasContent] = await Promise.all([
    hasForumContent(),
    hasBlogContent(),
  ]);

  return [
    ...(forumHasContent ? [] : ["/forum"]),
    ...(blogHasContent ? [] : ["/blog"]),
  ];
}
