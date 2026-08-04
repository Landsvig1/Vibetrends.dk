import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  getSkillById: vi.fn(),
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

import { getSkillById } from "@/lib/db";
import { SkillDetailContent } from "../page";

const getSkillByIdMock = vi.mocked(getSkillById);

describe("SkillDetailContent — /skills/[id] breadcrumbs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders detail content and category breadcrumbs", async () => {
    getSkillByIdMock.mockResolvedValue({
      id: "s1",
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

    const contentElement = await SkillDetailContent({ params: Promise.resolve({ id: "s1" }) });
    expect(contentElement).toBeTruthy();

    expect(getSkillByIdMock).toHaveBeenCalledWith("s1", "da");
  });

  it("calls notFound when skill does not exist", async () => {
    getSkillByIdMock.mockResolvedValue(null);

    await expect(
      SkillDetailContent({ params: Promise.resolve({ id: "non-existent" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("preserves specific subdirectory URL when githubUrl has a subpath", async () => {
    const specificUrl = "https://github.com/mikkelkrogsholm/dev-skills/tree/main/skill-creator";
    getSkillByIdMock.mockResolvedValue({
      id: "s_1782976306911",
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

    const contentElement = await SkillDetailContent({ params: Promise.resolve({ id: "s_1782976306911" }) });
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
});
