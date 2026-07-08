import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * U5 — server component tests for /skills page.tsx.
 *
 * Mirrors the shape of src/app/vibes/__tests__/page.test.ts (U4).
 *
 * These tests verify two things:
 *  1. The server component passes real skill data (not empty arrays) to the
 *     client island — this is the core crawlability/SSR assertion.
 *  2. The JSON-LD ItemList generated server-side reflects the fetched skills,
 *     not the empty list the previous client-state-based approach produced.
 *
 * We test SkillsPageContent (the inner async component) directly rather than
 * through the outer Suspense shell — the shell adds no data logic of its own.
 *
 * SkillsExplorer and loading.tsx are mocked to keep tests hermetic.
 */

// -- mocks must be declared before any import that triggers the mocked module --

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(),
}));

vi.mock("@/lib/jsonLd", () => ({
  jsonLdScript: (data: unknown) => JSON.stringify(data),
  skillsListJsonLd: (
    skills: { title: string; description: string; vibeCoder: string }[],
    name: string,
    description: string,
  ) => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: skills.length,
    itemListElement: skills.map((skill, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "SoftwareSourceCode",
        name: skill.title,
        description: skill.description,
        author: { "@type": "Person", name: skill.vibeCoder },
      },
    })),
  }),
}));

// Stub the client island — it receives initialAllSkills but we don't render it.
vi.mock("../SkillsExplorer", () => ({
  default: () => null,
}));

vi.mock("../loading", () => ({
  default: () => null,
}));

import { cookies } from "next/headers";
import { getSkills } from "@/lib/db";
import { SkillsPageContent, getValidView } from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cookiesMock = vi.mocked(cookies);
const getSkillsMock = vi.mocked(getSkills);

/** Minimal Skill fixture. */
function makeSkill(id: string, title: string, description: string) {
  return {
    id,
    title,
    description,
    vibeCoder: "alice",
    vibeCoderTitle: "Vibe Coder",
    category: "frontend" as const,
    categoryLabel: "Frontend",
    rating: 4.5,
    reviewsCount: 10,
    upvotes: 0,
    tags: [],
    githubUrl: "https://github.com/alice/skill",
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

  getSkillsMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// getValidView — pure helper
// ---------------------------------------------------------------------------

describe("getValidView", () => {
  it("returns 'danish' for undefined", () => {
    expect(getValidView(undefined)).toBe("danish");
  });
  it("returns 'danish' for unknown values", () => {
    expect(getValidView("popular")).toBe("danish");
    expect(getValidView("")).toBe("danish");
  });
  it("returns 'danish' when given 'danish'", () => {
    expect(getValidView("danish")).toBe("danish");
  });
  it("returns 'hot' when given 'hot'", () => {
    expect(getValidView("hot")).toBe("hot");
  });
  it("returns 'trending' when given 'trending'", () => {
    expect(getValidView("trending")).toBe("trending");
  });
  it("returns 'all' when given 'all'", () => {
    expect(getValidView("all")).toBe("all");
  });
});

// ---------------------------------------------------------------------------
// SkillsPageContent — data-fetch call contract
// ---------------------------------------------------------------------------

describe("SkillsPageContent — fetches with lang from cookie and validated view", () => {
  it("calls getSkills with the lang from the vibe_lang cookie", async () => {
    const skills = [makeSkill("s1", "Alpha Skill", "Alpha description here")];
    getSkillsMock.mockResolvedValue(skills);

    await SkillsPageContent({
      searchParams: Promise.resolve({ view: "danish" }),
    });

    // First call: full catalog (no view)
    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "en");
  });

  it("defaults lang to 'da' when the cookie is absent", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({ searchParams: Promise.resolve({}) });

    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "da");
  });

  it("fetches view-specific board for 'danish' view (default)", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({ searchParams: Promise.resolve({}) });

    // Second call: view-specific board
    expect(getSkillsMock).toHaveBeenCalledWith(
      undefined,
      undefined,
      "en",
      "danish"
    );
  });

  it("fetches view-specific board for 'hot' view", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({ searchParams: Promise.resolve({ view: "hot" }) });

    expect(getSkillsMock).toHaveBeenCalledWith(
      undefined,
      undefined,
      "en",
      "hot"
    );
  });

  it("fetches view-specific board for 'trending' view", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({
      searchParams: Promise.resolve({ view: "trending" }),
    });

    expect(getSkillsMock).toHaveBeenCalledWith(
      undefined,
      undefined,
      "en",
      "trending"
    );
  });

  it("does NOT fetch a view-specific board for 'all' (topic-cards view)", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({ searchParams: Promise.resolve({ view: "all" }) });

    // Only one call: the full catalog. No second view-specific call.
    expect(getSkillsMock).toHaveBeenCalledTimes(1);
    expect(getSkillsMock).toHaveBeenCalledWith(undefined, undefined, "en");
  });

  it("falls back to 'danish' for an unrecognised view param value", async () => {
    getSkillsMock.mockResolvedValue([]);

    await SkillsPageContent({
      searchParams: Promise.resolve({ view: "random" }),
    });

    expect(getSkillsMock).toHaveBeenCalledWith(
      undefined,
      undefined,
      "en",
      "danish"
    );
  });
});

// ---------------------------------------------------------------------------
// SkillsPageContent — JSON-LD server-side generation (core SEO assertion)
// ---------------------------------------------------------------------------

describe("SkillsPageContent — JSON-LD is built from server-fetched data, not empty state", () => {
  it("JSON-LD numberOfItems matches the number of fetched skills", async () => {
    const skills = [
      makeSkill("s1", "Skill One", "Description for skill one"),
      makeSkill("s2", "Skill Two", "Description for skill two"),
    ];
    // First call (full catalog) returns the skills; second call (view board) returns same.
    getSkillsMock.mockResolvedValue(skills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    // Result is a React Fragment: [script element, SkillsExplorer element].
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const scriptEl = children[0];
    const jsonLdString = scriptEl.props.dangerouslySetInnerHTML
      .__html as string;
    const jsonLd = JSON.parse(jsonLdString);

    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.numberOfItems).toBe(2);
    expect(jsonLd.itemListElement).toHaveLength(2);
  });

  it("JSON-LD itemListElement entries include skill title and description", async () => {
    const skills = [makeSkill("s1", "My AI Skill", "A great AI skill")];
    getSkillsMock.mockResolvedValue(skills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    const firstItem = jsonLd.itemListElement[0];
    expect(firstItem.position).toBe(1);
    expect(firstItem.item["@type"]).toBe("SoftwareSourceCode");
    expect(firstItem.item.name).toBe("My AI Skill");
    expect(firstItem.item.description).toBe("A great AI skill");
  });

  it("JSON-LD has numberOfItems 0 and empty itemListElement when getSkills returns []", async () => {
    getSkillsMock.mockResolvedValue([]);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const jsonLd = JSON.parse(children[0].props.dangerouslySetInnerHTML.__html);

    expect(jsonLd.numberOfItems).toBe(0);
    expect(jsonLd.itemListElement).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SkillsPageContent — SkillsExplorer receives initial skill lists (SSR content)
// ---------------------------------------------------------------------------

describe("SkillsPageContent — SkillsExplorer receives the fetched skill lists", () => {
  it("passes initialAllSkills to SkillsExplorer so SSR output contains real content", async () => {
    const allSkills = [
      makeSkill("s1", "Alpha Skill", "Alpha description here"),
      makeSkill("s2", "Beta Skill", "Beta description here"),
    ];
    // Both catalog and view-board calls return the same fixture for simplicity.
    getSkillsMock.mockResolvedValue(allSkills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];

    expect(explorerEl.props.initialAllSkills).toHaveLength(2);
    expect(explorerEl.props.initialAllSkills[0].title).toBe("Alpha Skill");
    expect(explorerEl.props.initialAllSkills[1].title).toBe("Beta Skill");
  });

  it("passes initialViewSkills for board views", async () => {
    const viewSkills = [makeSkill("s1", "Danish Skill", "A danish skill here")];
    getSkillsMock.mockResolvedValue(viewSkills);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({ view: "danish" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];

    expect(Array.isArray(explorerEl.props.initialViewSkills)).toBe(true);
    expect(explorerEl.props.initialViewSkills).toHaveLength(1);
    expect(explorerEl.props.initialViewSkills[0].title).toBe("Danish Skill");
  });

  it("passes empty initialViewSkills for 'all' (topic-cards) view", async () => {
    getSkillsMock.mockResolvedValue([makeSkill("s1", "Any", "Any skill desc")]);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({ view: "all" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];

    expect(Array.isArray(explorerEl.props.initialViewSkills)).toBe(true);
    expect(explorerEl.props.initialViewSkills).toHaveLength(0);
  });

  it("passes empty arrays when there are no skills (not undefined)", async () => {
    getSkillsMock.mockResolvedValue([]);

    const result = await SkillsPageContent({
      searchParams: Promise.resolve({}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (result as any).props.children as any[];
    const explorerEl = children[1];

    expect(Array.isArray(explorerEl.props.initialAllSkills)).toBe(true);
    expect(explorerEl.props.initialAllSkills).toHaveLength(0);
    expect(Array.isArray(explorerEl.props.initialViewSkills)).toBe(true);
  });

});
