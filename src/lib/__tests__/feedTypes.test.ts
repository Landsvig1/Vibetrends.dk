import { describe, it, expect } from "vitest";
import {
  FEED_TYPES,
  FEED_TYPE_SLUGS,
  HOSTS,
  HOST_SLUGS,
  getFeedType,
  getHost,
  feedTypeLabel,
} from "@/lib/feedTypes";

describe("feedTypes taxonomy", () => {
  it("getFeedType resolves a known slug and returns its data", () => {
    const tool = getFeedType("cli");
    expect(tool?.slug).toBe("cli");
    expect(tool?.href).toBe("/cli");
    expect(tool?.icon).toBeTruthy();
  });

  it("getHost resolves a known host slug", () => {
    expect(getHost("claude-code")?.name).toBe("Claude Code");
  });

  it("FEED_TYPE_SLUGS enumerates exactly the defined feed types", () => {
    expect([...FEED_TYPE_SLUGS]).toEqual(FEED_TYPES.map((f) => f.slug));
    expect(FEED_TYPE_SLUGS).toContain("skills");
    expect(FEED_TYPE_SLUGS).toContain("mcp-servers");
    expect(FEED_TYPE_SLUGS).toContain("cli");
  });

  it("HOST_SLUGS enumerates exactly the defined hosts", () => {
    expect([...HOST_SLUGS]).toEqual(HOSTS.map((h) => h.slug));
    expect(HOST_SLUGS).toHaveLength(3);
  });

  it("feedTypeLabel returns the da label for da and the en label for en", () => {
    expect(feedTypeLabel("cli", "da")).toBe("CLI'er");
    expect(feedTypeLabel("cli", "en")).toBe("CLIs");
  });

  it("feedTypeLabel falls back to the raw slug when unknown", () => {
    expect(feedTypeLabel("does-not-exist")).toBe("does-not-exist");
  });

  it("getFeedType / getHost return undefined for unknown slugs", () => {
    expect(getFeedType("nope")).toBeUndefined();
    expect(getHost("nope")).toBeUndefined();
  });
});
