import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * U4 — server component tests for /vibes page.tsx.
 *
 * These tests verify two things:
 *  1. The server component passes real project data (not an empty list) to the
 *     client island — this is the core crawlability/SSR assertion.
 *  2. The JSON-LD ItemList generated server-side reflects all fetched projects,
 *     not the empty list that the previous client-state-based approach produced.
 *
 * We test VibesPageContent (the inner async component) directly rather than
 * through the outer Suspense shell, because the shell just wraps a Suspense
 * boundary — it adds no data logic of its own.
 *
 * VibesExplorer and loading.tsx are mocked to keep tests hermetic. The
 * important contract here is what the server component computes and passes as
 * props, not how the client island renders it.
 */

// -- mocks must be declared before any import that triggers the mocked module --

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/lib/jsonLd", () => ({
  // Pass through the JSON string directly so we can parse it in assertions.
  jsonLdScript: (data: unknown) => JSON.stringify(data),
}));

// Stub the client island — it receives initialProjects but we don't render it.
vi.mock("../VibesExplorer", () => ({
  default: () => null,
}));

vi.mock("../loading", () => ({
  default: () => null,
}));

import { cookies } from "next/headers";
import { getProjects } from "@/lib/db";
import { VibesPageContent, getValidSort } from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cookiesMock = vi.mocked(cookies);
const getProjectsMock = vi.mocked(getProjects);

/** Minimal ShowcaseProject fixture. */
function makeProject(id: string, title: string, description: string) {
  return {
    id,
    title,
    description,
    author: "alice",
    upvotes: 0,
    imageUrl: "https://images.unsplash.com/photo-1.jpg",
    demoUrl: "https://example.com",
    githubUrl: undefined,
    tools: [],
    prompts: [],
    createdAt: "2026-01-01",
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: English cookie
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === "vibe_lang" ? { name: "vibe_lang", value: "en" } : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  getProjectsMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// getValidSort — pure helper
// ---------------------------------------------------------------------------

describe("getValidSort", () => {
  it("returns 'new' for undefined", () => {
    expect(getValidSort(undefined)).toBe("new");
  });
  it("returns 'new' for unknown values", () => {
    expect(getValidSort("popular")).toBe("new");
    expect(getValidSort("")).toBe("new");
  });
  it("returns 'top' when given 'top'", () => {
    expect(getValidSort("top")).toBe("top");
  });
  it("returns 'az' when given 'az'", () => {
    expect(getValidSort("az")).toBe("az");
  });
});

// ---------------------------------------------------------------------------
// VibesPageContent — prop-passing / data contract
// ---------------------------------------------------------------------------

describe("VibesPageContent — passes real project data to client island", () => {
  it("calls getProjects with the lang from the vibe_lang cookie and the validated sort", async () => {
    const projects = [makeProject("p1", "Alpha", "Alpha description long enough")];
    getProjectsMock.mockResolvedValue(projects);

    await VibesPageContent({
      searchParams: Promise.resolve({ sort: "top" }),
    });

    expect(getProjectsMock).toHaveBeenCalledWith(
      undefined, // no search term from server component
      "en",      // lang from mocked cookie
      "top"      // validated sort
    );
  });

  it("defaults lang to 'da' when the cookie is absent", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    getProjectsMock.mockResolvedValue([]);

    await VibesPageContent({ searchParams: Promise.resolve({}) });

    expect(getProjectsMock).toHaveBeenCalledWith(undefined, "da", "new");
  });

  it("defaults sort to 'new' when searchParams has no sort", async () => {
    getProjectsMock.mockResolvedValue([]);

    await VibesPageContent({ searchParams: Promise.resolve({}) });

    expect(getProjectsMock).toHaveBeenCalledWith(undefined, "en", "new");
  });

  it("falls back to 'new' for an unrecognised sort param value", async () => {
    getProjectsMock.mockResolvedValue([]);

    await VibesPageContent({ searchParams: Promise.resolve({ sort: "random" }) });

    expect(getProjectsMock).toHaveBeenCalledWith(undefined, "en", "new");
  });

  it("passes ?q= as search to getProjects when present", async () => {
    const projects = [makeProject("p1", "React App", "A React-based project")];
    getProjectsMock.mockResolvedValue(projects);

    await VibesPageContent({
      searchParams: Promise.resolve({ q: "react" }),
    });

    expect(getProjectsMock).toHaveBeenCalledWith(
      "react", // search term from ?q= param
      "en",
      "new"
    );
  });

  it("passes undefined search when q is empty string", async () => {
    getProjectsMock.mockResolvedValue([]);

    await VibesPageContent({
      searchParams: Promise.resolve({ q: "" }),
    });

    expect(getProjectsMock).toHaveBeenCalledWith(undefined, "en", "new");
  });
});

// ---------------------------------------------------------------------------
// VibesPageContent — JSON-LD server-side generation (core SEO assertion)
// ---------------------------------------------------------------------------

describe("VibesPageContent — JSON-LD is built from server-fetched data, not empty state", () => {
  it("JSON-LD numberOfItems matches the number of fetched projects", async () => {
    const projects = [
      makeProject("p1", "Project One", "Description for project one"),
      makeProject("p2", "Project Two", "Description for project two"),
    ];
    getProjectsMock.mockResolvedValue(projects);

    const result = await VibesPageContent({ searchParams: Promise.resolve({}) });

    // The result is a React Fragment: [script element, VibesExplorer element].
    // We extract the JSON-LD from the script element's dangerouslySetInnerHTML prop.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const scriptEl = children[0];
    const jsonLdString = scriptEl.props.dangerouslySetInnerHTML.__html as string;
    const jsonLd = JSON.parse(jsonLdString);

    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.numberOfItems).toBe(2);
    expect(jsonLd.itemListElement).toHaveLength(2);
  });

  it("JSON-LD itemListElement entries include project title and description", async () => {
    const projects = [makeProject("p1", "My Vibe App", "A great app for testing")];
    getProjectsMock.mockResolvedValue(projects);

    const result = await VibesPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    const firstItem = jsonLd.itemListElement[0];
    expect(firstItem.position).toBe(1);
    expect(firstItem.item["@type"]).toBe("SoftwareApplication");
    expect(firstItem.item.name).toBe("My Vibe App");
    expect(firstItem.item.description).toBe("A great app for testing");
  });

  it("JSON-LD has numberOfItems 0 and empty itemListElement when getProjects returns []", async () => {
    getProjectsMock.mockResolvedValue([]);

    const result = await VibesPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    expect(jsonLd.numberOfItems).toBe(0);
    expect(jsonLd.itemListElement).toHaveLength(0);
  });

  it("JSON-LD reflects search-filtered result when ?q= is present", async () => {
    // When ?q=react is in the URL, getProjects returns only matching projects.
    // The JSON-LD must be built from that filtered list — not the full catalog.
    const filteredProjects = [
      makeProject("p1", "React Vibe App", "A project that uses React"),
    ];
    getProjectsMock.mockResolvedValue(filteredProjects);

    const result = await VibesPageContent({
      searchParams: Promise.resolve({ q: "react" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    // JSON-LD shows the filtered count, not the full catalog count.
    expect(jsonLd.numberOfItems).toBe(1);
    expect(jsonLd.itemListElement).toHaveLength(1);
    expect(jsonLd.itemListElement[0].item.name).toBe("React Vibe App");
  });
});

// ---------------------------------------------------------------------------
// VibesPageContent — VibesExplorer receives initialProjects (SSR content)
// ---------------------------------------------------------------------------

describe("VibesPageContent — VibesExplorer receives the fetched project list", () => {
  it("passes initialProjects to VibesExplorer so SSR output contains real content", async () => {
    const projects = [
      makeProject("p1", "Alpha Project", "Alpha description long enough"),
      makeProject("p2", "Beta Project", "Beta description long enough"),
    ];
    getProjectsMock.mockResolvedValue(projects);

    const result = await VibesPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];

    // The explorer element's initialProjects prop must be the real fetched list.
    expect(explorerEl.props.initialProjects).toHaveLength(2);
    expect(explorerEl.props.initialProjects[0].title).toBe("Alpha Project");
    expect(explorerEl.props.initialProjects[1].title).toBe("Beta Project");
  });

  it("passes an empty array when there are no projects (not undefined)", async () => {
    getProjectsMock.mockResolvedValue([]);

    const result = await VibesPageContent({ searchParams: Promise.resolve({}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];
    expect(Array.isArray(explorerEl.props.initialProjects)).toBe(true);
    expect(explorerEl.props.initialProjects).toHaveLength(0);
  });
});
