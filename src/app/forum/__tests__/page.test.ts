import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * U6 — server component tests for /forum page.tsx.
 *
 * These tests verify:
 *  1. The server component passes real thread data (not an empty list) to the
 *     client island — this is the core crawlability/SSR assertion.
 *  2. The JSON-LD ItemList/DiscussionForumPosting generated server-side
 *     reflects all fetched threads, not the empty list that the previous
 *     client-only approach produced (the forum hub previously had NO JSON-LD
 *     at all — layout.tsx only supplies static metadata).
 *  3. Reply counts (from getThreads' batched reply fetch) are included in the
 *     props passed to ForumExplorer.
 *
 * We test ForumPageContent (the inner async component) directly rather than
 * through the outer Suspense shell, because the shell just wraps a Suspense
 * boundary — it adds no data logic of its own.
 *
 * ForumExplorer and loading.tsx are mocked to keep tests hermetic.
 */

// -- mocks must be declared before any import that triggers the mocked module --

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getThreads: vi.fn(),
}));

vi.mock("@/lib/jsonLd", () => ({
  // Pass through the JSON string directly so we can parse it in assertions.
  jsonLdScript: (data: unknown) => JSON.stringify(data),
}));

// Stub the client island — it receives initialThreads but we don't render it.
vi.mock("../ForumExplorer", () => ({
  default: () => null,
}));

vi.mock("../loading", () => ({
  default: () => null,
}));

import { cookies } from "next/headers";
import { getThreads } from "@/lib/db";
import { ForumPageContent, getValidForumView } from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cookiesMock = vi.mocked(cookies);
const getThreadsMock = vi.mocked(getThreads);

/** Minimal ForumThread fixture with reply counts. */
function makeThread(
  id: string,
  title: string,
  content: string,
  replyCount = 0
) {
  return {
    id,
    title,
    author: "alice",
    category: "General" as const,
    content,
    upvotes: 0,
    replies: Array.from({ length: replyCount }, (_, i) => ({
      id: `reply-${i}`,
      threadId: id,
      author: "bob",
      content: `Reply ${i}`,
      upvotes: 0,
      createdAt: "2026-01-02",
    })),
    createdAt: "2026-01-01",
    isDanish: false,
    denmarkSpecific: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: Danish cookie
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === "vibe_lang" ? { name: "vibe_lang", value: "da" } : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  getThreadsMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// getValidForumView — pure helper
// ---------------------------------------------------------------------------

describe("getValidForumView", () => {
  it("returns 'danish' for undefined (default-to-Dansk pattern)", () => {
    expect(getValidForumView(undefined)).toBe("danish");
  });
  it("returns 'danish' for unknown values", () => {
    expect(getValidForumView("popular")).toBe("danish");
    expect(getValidForumView("az")).toBe("danish");
    expect(getValidForumView("")).toBe("danish");
  });
  it("returns 'new' when given 'new'", () => {
    expect(getValidForumView("new")).toBe("new");
  });
  it("returns 'top' when given 'top'", () => {
    expect(getValidForumView("top")).toBe("top");
  });
});

// ---------------------------------------------------------------------------
// ForumPageContent — prop-passing / data contract
// ---------------------------------------------------------------------------
//
// getThreads only understands top/new — "danish" and "top" both fetch with
// server sort 'top' (the Dansk tab's filter/sort runs client-side in
// ForumExplorer on top of that base list).

describe("ForumPageContent — passes real thread data to client island", () => {
  it("calls getThreads with lang from the vibe_lang cookie and server sort for 'new' view", async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "vibe_lang" ? { name: "vibe_lang", value: "en" } : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const threads = [makeThread("t1", "Thread One", "Content one")];
    getThreadsMock.mockResolvedValue(threads);

    await ForumPageContent({
      searchParams: Promise.resolve({ view: "new" }),
    });

    expect(getThreadsMock).toHaveBeenCalledWith(
      undefined, // no search
      undefined, // no category (All → undefined)
      "en",      // lang from mocked cookie
      undefined, // no limit
      "new"      // 'new' view maps directly to server sort 'new'
    );
  });

  it("defaults lang to 'da' when the cookie is absent", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    getThreadsMock.mockResolvedValue([]);

    await ForumPageContent({ searchParams: Promise.resolve({}) });

    expect(getThreadsMock).toHaveBeenCalledWith(undefined, undefined, "da", undefined, "top");
  });

  it("defaults to the 'danish' view (server sort 'top') when searchParams has no view", async () => {
    getThreadsMock.mockResolvedValue([]);

    await ForumPageContent({ searchParams: Promise.resolve({}) });

    expect(getThreadsMock).toHaveBeenCalledWith(undefined, undefined, "da", undefined, "top");
  });

  it("falls back to the 'danish' view (server sort 'top') for an unrecognised view param value", async () => {
    getThreadsMock.mockResolvedValue([]);

    await ForumPageContent({
      searchParams: Promise.resolve({ view: "random" }),
    });

    expect(getThreadsMock).toHaveBeenCalledWith(undefined, undefined, "da", undefined, "top");
  });

  it("passes the category to getThreads when it is not 'All'", async () => {
    getThreadsMock.mockResolvedValue([]);

    await ForumPageContent({
      searchParams: Promise.resolve({ category: "Tools" }),
    });

    expect(getThreadsMock).toHaveBeenCalledWith(undefined, "Tools", "da", undefined, "top");
  });

  it("passes undefined for category when it is 'All'", async () => {
    getThreadsMock.mockResolvedValue([]);

    await ForumPageContent({
      searchParams: Promise.resolve({ category: "All" }),
    });

    expect(getThreadsMock).toHaveBeenCalledWith(undefined, undefined, "da", undefined, "top");
  });
});

// ---------------------------------------------------------------------------
// ForumPageContent — JSON-LD server-side generation (core SEO assertion)
// ---------------------------------------------------------------------------

describe("ForumPageContent — JSON-LD is built from server-fetched data, not empty state", () => {
  it("JSON-LD numberOfItems matches the number of fetched threads", async () => {
    const threads = [
      makeThread("t1", "Thread One", "Content one"),
      makeThread("t2", "Thread Two", "Content two"),
    ];
    getThreadsMock.mockResolvedValue(threads);

    const result = await ForumPageContent({ searchParams: Promise.resolve({}) });

    // Result is a React Fragment: [script element, ForumExplorer element].
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const scriptEl = children[0];
    const jsonLd = JSON.parse(scriptEl.props.dangerouslySetInnerHTML.__html);

    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.numberOfItems).toBe(2);
    expect(jsonLd.itemListElement).toHaveLength(2);
  });

  it("JSON-LD itemListElement entries are DiscussionForumPosting with thread title and author", async () => {
    const threads = [makeThread("t1", "My Forum Thread", "Content here")];
    getThreadsMock.mockResolvedValue(threads);

    const result = await ForumPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    const firstItem = jsonLd.itemListElement[0];
    expect(firstItem.position).toBe(1);
    expect(firstItem.item["@type"]).toBe("DiscussionForumPosting");
    expect(firstItem.item.headline).toBe("My Forum Thread");
    expect(firstItem.item.author.name).toBe("alice");
    expect(firstItem.item.url).toContain("/forum/t1");
  });

  it("JSON-LD has numberOfItems 0 and empty itemListElement when getThreads returns []", async () => {
    getThreadsMock.mockResolvedValue([]);

    const result = await ForumPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    expect(jsonLd.numberOfItems).toBe(0);
    expect(jsonLd.itemListElement).toHaveLength(0);
  });

  it("JSON-LD is non-empty when threads exist — confirms server-side population", async () => {
    const threads = [
      makeThread("t1", "Alpha Thread", "Alpha content"),
      makeThread("t2", "Beta Thread", "Beta content"),
      makeThread("t3", "Gamma Thread", "Gamma content"),
    ];
    getThreadsMock.mockResolvedValue(threads);

    const result = await ForumPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    expect(jsonLd.numberOfItems).toBeGreaterThan(0);
    expect(jsonLd.itemListElement.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ForumPageContent — ForumExplorer receives initialThreads (SSR content)
// ---------------------------------------------------------------------------

describe("ForumPageContent — ForumExplorer receives the fetched thread list", () => {
  it("passes initialThreads to ForumExplorer so SSR output contains real content", async () => {
    const threads = [
      makeThread("t1", "Alpha Thread", "Alpha content"),
      makeThread("t2", "Beta Thread", "Beta content"),
    ];
    getThreadsMock.mockResolvedValue(threads);

    const result = await ForumPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];

    expect(explorerEl.props.initialThreads).toHaveLength(2);
    expect(explorerEl.props.initialThreads[0].title).toBe("Alpha Thread");
    expect(explorerEl.props.initialThreads[1].title).toBe("Beta Thread");
  });

  it("passes an empty array when there are no threads (not undefined)", async () => {
    getThreadsMock.mockResolvedValue([]);

    const result = await ForumPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];
    expect(Array.isArray(explorerEl.props.initialThreads)).toBe(true);
    expect(explorerEl.props.initialThreads).toHaveLength(0);
  });

  it("reply counts are included in the passed initialThreads (from batched reply fetch)", async () => {
    // getThreads' batched reply fetch populates thread.replies with reply
    // objects. The server passes these to ForumExplorer, which renders
    // thread.replies.length as the reply count.
    const threads = [
      makeThread("t1", "Thread with replies", "Content", 3),
      makeThread("t2", "Thread no replies", "Content", 0),
    ];
    getThreadsMock.mockResolvedValue(threads);

    const result = await ForumPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];
    const passed = explorerEl.props.initialThreads;

    expect(passed[0].replies).toHaveLength(3);
    expect(passed[1].replies).toHaveLength(0);
  });

  it("passes initialView and initialCategory so ForumExplorer can skip first mount fetch", async () => {
    getThreadsMock.mockResolvedValue([]);

    const result = await ForumPageContent({
      searchParams: Promise.resolve({ view: "new", category: "Tools" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];

    expect(explorerEl.props.initialView).toBe("new");
    expect(explorerEl.props.initialCategory).toBe("Tools");
  });
});
