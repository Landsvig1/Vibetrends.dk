import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests for src/lib/hubContent.ts — the single predicate behind three things
 * that must agree: the sitemap's hub entries, the hubs' robots noindex, and
 * whether the header nav advertises them.
 */

const state = vi.hoisted(() => ({
  threads: [] as { id: string }[],
  posts: [] as { id: string }[],
}));

vi.mock("@/lib/db", () => ({
  getThreads: vi.fn(async () => state.threads),
  getBlogPosts: vi.fn(async () => state.posts),
  // Real implementation, not a stub: a mocked-away fixture filter would hide
  // exactly the disagreement these tests exist to catch.
  isE2eFixtureId: (id: string) => id.startsWith("e2e-fixture-"),
}));

import { hasRealContent, hiddenNavHrefs } from "@/lib/hubContent";

beforeEach(() => {
  state.threads = [];
  state.posts = [];
});

describe("hasRealContent()", () => {
  it("is false for an empty hub", () => {
    expect(hasRealContent([])).toBe(false);
  });

  it("is true once a real row exists", () => {
    expect(hasRealContent([{ id: "thread-1" }])).toBe(true);
  });

  it("discounts e2e fixture rows", () => {
    expect(hasRealContent([{ id: "e2e-fixture-1" }])).toBe(false);
  });

  it("is true when a real row sits alongside fixture rows", () => {
    expect(hasRealContent([{ id: "e2e-fixture-1" }, { id: "thread-1" }])).toBe(true);
  });
});

describe("hiddenNavHrefs()", () => {
  it("hides both hubs while they are empty", async () => {
    expect(await hiddenNavHrefs()).toEqual(["/forum", "/blog"]);
  });

  it("reveals /forum on the first real thread", async () => {
    state.threads = [{ id: "thread-1" }];
    expect(await hiddenNavHrefs()).toEqual(["/blog"]);
  });

  it("reveals /blog on the first published post", async () => {
    state.posts = [{ id: "post-1" }];
    expect(await hiddenNavHrefs()).toEqual(["/forum"]);
  });

  it("hides nothing once both hubs have content", async () => {
    state.threads = [{ id: "thread-1" }];
    state.posts = [{ id: "post-1" }];
    expect(await hiddenNavHrefs()).toEqual([]);
  });

  it("keeps a hub hidden when its only rows are e2e fixtures", async () => {
    state.threads = [{ id: "e2e-fixture-thread" }];
    state.posts = [{ id: "e2e-fixture-post" }];
    expect(await hiddenNavHrefs()).toEqual(["/forum", "/blog"]);
  });
});
