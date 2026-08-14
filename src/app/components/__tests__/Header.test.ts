import { describe, it, expect } from "vitest";
import { Sparkles, Cpu, TerminalSquare } from "lucide-react";
import { FEED_TYPES } from "@/lib/feedTypes";
import { buildNavItems, FEED_TYPE_ICONS } from "../Header";

describe("Header navigation — catalog sub-items derive from FEED_TYPES", () => {
  it("explicitly maps an icon for every feed type in FEED_TYPES", () => {
    FEED_TYPES.forEach((feedType) => {
      expect(
        FEED_TYPE_ICONS[feedType.icon],
        `Icon "${feedType.icon}" for feed type "${feedType.slug}" must be mapped in FEED_TYPE_ICONS to prevent silent fallback`
      ).toBeDefined();
    });
  });

  it("derives Tools dropdown items directly from FEED_TYPES in order, label, href, and icon", () => {
    const navItems = buildNavItems();
    const toolsItem = navItems.find((item) => item.name === "Tools");

    expect(toolsItem).toBeDefined();
    expect(toolsItem?.isDropdown).toBe(true);
    expect(toolsItem?.items).toBeDefined();
    expect(toolsItem?.items).toHaveLength(FEED_TYPES.length);

    // Exact 1:1 order, labelDa, href, and mapped icon match
    toolsItem?.items?.forEach((subItem, index) => {
      const feedType = FEED_TYPES[index];
      expect(subItem.name).toBe(feedType.labelDa);
      expect(subItem.href).toBe(feedType.href);
      expect(subItem.icon).toBe(FEED_TYPE_ICONS[feedType.icon]);
    });

    // Explicit taxonomy lock asserting current values
    expect(toolsItem?.items?.map((i) => i.name)).toEqual(FEED_TYPES.map((f) => f.labelDa));
    expect(toolsItem?.items?.map((i) => i.href)).toEqual(FEED_TYPES.map((f) => f.href));
    expect(toolsItem?.items?.map((i) => i.icon)).toEqual([Sparkles, Cpu, TerminalSquare]);
  });

  it("preserves top-level nav items structure", () => {
    const navItems = buildNavItems();
    const topLevelNames = navItems.map((item) => item.name);

    expect(topLevelNames).toEqual([
      "Forum",
      "Vibes",
      "Tools",
      "Blog",
      "For agenter",
    ]);
  });

  it("filters top-level items using hiddenHrefs while keeping Tools catalog intact", () => {
    const navItems = buildNavItems(["/blog"]);
    const topLevelHrefs = navItems.map((item) => item.href).filter(Boolean);

    expect(topLevelHrefs).not.toContain("/blog");
    expect(topLevelHrefs).toContain("/forum");
    expect(topLevelHrefs).toContain("/vibes");
    expect(topLevelHrefs).toContain("/agent-guide");

    const toolsItem = navItems.find((item) => item.name === "Tools");
    expect(toolsItem?.items).toHaveLength(FEED_TYPES.length);
  });
});
