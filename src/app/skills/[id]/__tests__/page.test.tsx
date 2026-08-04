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
});
