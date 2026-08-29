import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  getSkillBySlug: vi.fn(),
  getCollectionSize: vi.fn().mockResolvedValue(0),
  getLatestSecurityScan: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/app/components/ConnectBlock", () => ({
  default: () => null,
}));

vi.mock("../SkillDocSection", () => ({
  default: () => null,
}));

import { getSkillBySlug } from "@/lib/db";
import { SkillDetailContent } from "../page";

const getSkillBySlugMock = vi.mocked(getSkillBySlug);

describe("SkillDetailContent — /skills/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders detail content and category breadcrumbs", async () => {
    getSkillBySlugMock.mockResolvedValue({
      id: "s1",
      slug: "anthropic-skills-pack",
      title: "Anthropic Skills Pack",
      description: "Comprehensive skills for Claude Code",
      category: "agent-methodology",
      categoryLabel: "Agents & Tools",
      vibeCoder: "kasper",
      vibeCoderTitle: "AI Architect",
      rating: 4.8,
      reviewsCount: 12,
      upvotes: 42,
      tags: ["claude", "mcp"],
      githubUrl: "https://github.com/anthropics/skills-pack",
    });

    const contentElement = await SkillDetailContent({
      params: Promise.resolve({ slug: "anthropic-skills-pack" }),
    });
    expect(contentElement).toBeTruthy();

    // Resolved by slug, never by id: the id path is the proxy's job.
    expect(getSkillBySlugMock).toHaveBeenCalledWith("anthropic-skills-pack", "da");
  });

  it("calls notFound when skill does not exist", async () => {
    getSkillBySlugMock.mockResolvedValue(null);

    await expect(
      SkillDetailContent({ params: Promise.resolve({ slug: "non-existent" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("preserves specific subdirectory URL when githubUrl has a subpath", async () => {
    const specificUrl = "https://github.com/mikkelkrogsholm/dev-skills/tree/main/skill-creator";
    getSkillBySlugMock.mockResolvedValue({
      id: "s_1782976306911",
      slug: "skill-creator",
      title: "Skill Creator",
      description: "Design, develop, and refine high-quality agent skills",
      category: "agent-methodology",
      categoryLabel: "Agents & Tools",
      vibeCoder: "mikkelkrogsholm",
      vibeCoderTitle: "Contributor",
      rating: 5.0,
      reviewsCount: 0,
      upvotes: 1,
      tags: ["claude", "skills"],
      githubUrl: specificUrl,
    });

    const contentElement = await SkillDetailContent({ params: Promise.resolve({ slug: "skill-creator" }) });
    expect(contentElement).toBeTruthy();

    // Recursively extract all href props from the JSX element tree
    const extractHrefs = (node: unknown): string[] => {
      if (!node || typeof node !== "object") return [];
      const hrefs: string[] = [];
      if ("props" in node && node.props && typeof node.props === "object") {
        const props = node.props as { href?: string; children?: unknown };
        if (props.href) hrefs.push(props.href);
        if (Array.isArray(props.children)) {
          props.children.forEach((child) => hrefs.push(...extractHrefs(child)));
        } else if (props.children) {
          hrefs.push(...extractHrefs(props.children));
        }
      }
      return hrefs;
    };

    const hrefs = extractHrefs(contentElement);
    expect(hrefs).toContain(specificUrl);
  });

  it("builds the breadcrumb URL from the slug, never the id", async () => {
    getSkillBySlugMock.mockResolvedValue({
      id: "s_1782976306911",
      slug: "skill-creator",
      title: "Skill Creator",
      description: "Design, develop, and refine high-quality agent skills",
      category: "agent-methodology",
      categoryLabel: "Agents & Tools",
      vibeCoder: "mikkelkrogsholm",
      vibeCoderTitle: "Contributor",
      rating: 5.0,
      reviewsCount: 0,
      upvotes: 1,
      tags: [],
      githubUrl: "https://github.com/mikkelkrogsholm/dev-skills",
    });

    const element = await SkillDetailContent({ params: Promise.resolve({ slug: "skill-creator" }) });

    // The breadcrumb URL lives in a JSON-LD <script>, so read the rendered
    // markup out of the tree rather than stringifying the element (React
    // elements carry circular refs).
    const collectHtml = (node: unknown): string[] => {
      if (!node || typeof node !== "object") return [];
      const out: string[] = [];
      if ("props" in node && node.props && typeof node.props === "object") {
        const props = node.props as {
          dangerouslySetInnerHTML?: { __html?: string };
          children?: unknown;
        };
        if (props.dangerouslySetInnerHTML?.__html) out.push(props.dangerouslySetInnerHTML.__html);
        const children = props.children;
        if (Array.isArray(children)) children.forEach((c) => out.push(...collectHtml(c)));
        else if (children) out.push(...collectHtml(children));
      }
      return out;
    };

    const html = collectHtml(element).join("\n");
    expect(html).toContain("https://vibetrends.dk/skills/skill-creator");
    expect(html).not.toContain("/skills/s_1782976306911");
  });
});
