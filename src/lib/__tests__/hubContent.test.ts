import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests for src/lib/hubContent.ts — the single answer behind three things that
 * must agree: the sitemap's hub entries, the hubs' robots noindex, and whether
 * the header nav advertises them.
 *
 * The failure case is the interesting one. countRealThreads/countRealBlogPosts
 * throw when the read fails (rather than reporting 0, which is what every other
 * reader in db.ts collapses an error into) so that this module can decide how
 * to degrade. It must degrade toward "has content": the alternative deindexes a
 * live hub on a transient Supabase blip and leaves it that way.
 */

const state = vi.hoisted(() => ({
  threads: 0 as number | Error,
  posts: 0 as number | Error,
  // Stands in for a Next prerender bail-out: unstable_rethrow re-throws those
  // instead of letting the catch swallow them.
  rethrows: false,
}));

const resolve = (value: number | Error) =>
  value instanceof Error ? Promise.reject(value) : Promise.resolve(value);

vi.mock("@/lib/db", () => ({
  countRealThreads: vi.fn(() => resolve(state.threads)),
  countRealBlogPosts: vi.fn(() => resolve(state.posts)),
}));

const unstable_rethrow = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ unstable_rethrow }));

import { hasBlogContent, hasForumContent, hiddenNavHrefs } from "@/lib/hubContent";

beforeEach(() => {
  state.threads = 0;
  state.posts = 0;
  state.rethrows = false;
  unstable_rethrow.mockReset();
  unstable_rethrow.mockImplementation((err: unknown) => {
    if (state.rethrows) throw err;
  });
});

describe("hasForumContent() / hasBlogContent()", () => {
  it("are false for an empty hub", async () => {
    expect(await hasForumContent()).toBe(false);
    expect(await hasBlogContent()).toBe(false);
  });

  it("are true once a real row exists", async () => {
    state.threads = 1;
    state.posts = 3;
    expect(await hasForumContent()).toBe(true);
    expect(await hasBlogContent()).toBe(true);
  });

  it("fail open when the count read throws", async () => {
    state.threads = new Error("connection reset");
    state.posts = new Error("connection reset");
    expect(await hasForumContent()).toBe(true);
    expect(await hasBlogContent()).toBe(true);
  });

  // cacheComponents is on, and Next signals a prerender bail-out by throwing.
  // Swallowing that would bake "this hub has content" into the build instead of
  // letting Next handle it, so every catch has to run the error past
  // unstable_rethrow before deciding to degrade.
  it("route every caught error through unstable_rethrow", async () => {
    state.threads = new Error("connection reset");
    await hasForumContent();
    expect(unstable_rethrow).toHaveBeenCalledWith(state.threads);

    state.posts = new Error("connection reset");
    await hasBlogContent();
    expect(unstable_rethrow).toHaveBeenCalledWith(state.posts);
  });

  it("propagate a bail-out instead of failing open", async () => {
    state.rethrows = true;
    state.threads = new Error("prerender bail-out");
    state.posts = new Error("prerender bail-out");

    await expect(hasForumContent()).rejects.toThrow("prerender bail-out");
    await expect(hasBlogContent()).rejects.toThrow("prerender bail-out");
  });
});

describe("hiddenNavHrefs()", () => {
  it("hides only /blog while both hubs are empty", async () => {
    // /forum is deliberately NOT gated on its own content: it is the one hub a
    // visitor can fill, so hiding it while empty is self-sealing. Its empty
    // state is designed instead. /blog is author-only and stays gated.
    expect(await hiddenNavHrefs()).toEqual(["/blog"]);
  });

  it("keeps /forum linked whether or not it has threads", async () => {
    expect(await hiddenNavHrefs()).not.toContain("/forum");
    state.threads = 1;
    expect(await hiddenNavHrefs()).not.toContain("/forum");
  });

  it("reveals /blog on the first published post", async () => {
    state.posts = 1;
    expect(await hiddenNavHrefs()).toEqual([]);
  });

  it("hides nothing once the blog has content", async () => {
    state.threads = 2;
    state.posts = 2;
    expect(await hiddenNavHrefs()).toEqual([]);
  });

  it("hides nothing when the read fails, rather than unlinking a live hub", async () => {
    state.posts = new Error("supabase unavailable");
    expect(await hiddenNavHrefs()).toEqual([]);
  });

  it("does not read the thread count at all", async () => {
    // The forum decision no longer depends on it, so a broken thread count must
    // not be able to take the blog link down with it.
    state.threads = new Error("supabase unavailable");
    state.posts = 0;
    expect(await hiddenNavHrefs()).toEqual(["/blog"]);
  });
});
