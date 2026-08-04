import { getBlogPosts, getThreads, isE2eFixtureId } from "@/lib/db";

/**
 * A hub counts as empty until it has at least one non-fixture row.
 *
 * e2e fixture rows (scripts/seed-e2e-fixtures.mjs) are short-lived and must
 * never make a hub look populated. Three places depend on this answer — the
 * sitemap, the hub's robots meta, and the header nav — and they have to agree.
 * They didn't when only the sitemap filtered fixtures: a build inside a CI seed
 * window rendered /forum indexable while the sitemap still omitted it.
 */
export function hasRealContent(rows: readonly { id: string }[]): boolean {
  return rows.some((row) => !isE2eFixtureId(row.id));
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
 * the Supabase dashboard — touches no tag, and both reads below are
 * cacheLife('max'). The hub then stays hidden and noindexed until something
 * revalidates. getSkillDoc (db.ts) documents the same trap. If you seed content
 * by hand, revalidate or redeploy afterwards.
 */
export async function hiddenNavHrefs(): Promise<string[]> {
  const [threads, posts] = await Promise.all([getThreads(), getBlogPosts()]);

  return [
    ...(hasRealContent(threads) ? [] : ["/forum"]),
    ...(hasRealContent(posts) ? [] : ["/blog"]),
  ];
}
