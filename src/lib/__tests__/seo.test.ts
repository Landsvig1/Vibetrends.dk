import { describe, it, expect } from "vitest";
import { entityMetadata, clampDescription, truncateTitle } from "@/lib/seo";

describe("entityMetadata", () => {
  it("sets a language-agnostic canonical and maps lang to og:locale", () => {
    const da = entityMetadata({ title: "T", description: "D", path: "/skills/s1", lang: "da" });
    expect(da.alternates?.canonical).toBe("/skills/s1");
    expect((da.openGraph as { locale?: string }).locale).toBe("da_DK");
    expect((da.openGraph as { url?: string }).url).toBe("/skills/s1");

    const en = entityMetadata({ title: "T", description: "D", path: "/skills/s1", lang: "en" });
    expect((en.openGraph as { locale?: string }).locale).toBe("en_US");
  });

  it("omits images when none is provided, includes them when present", () => {
    const without = entityMetadata({ title: "T", description: "D", path: "/blog/b1" });
    expect((without.openGraph as { images?: unknown }).images).toBeUndefined();

    const withImg = entityMetadata({ title: "T", description: "D", path: "/blog/b1", image: "/og.png" });
    expect((withImg.openGraph as { images?: unknown[] }).images).toEqual([{ url: "/og.png" }]);
    expect((withImg.twitter as { images?: unknown[] }).images).toEqual(["/og.png"]);
  });

  it("defaults og:type to website and honors an article override", () => {
    expect((entityMetadata({ title: "T", description: "D", path: "/x" }).openGraph as { type?: string }).type).toBe("website");
    expect(
      (entityMetadata({ title: "T", description: "D", path: "/x", type: "article" }).openGraph as { type?: string }).type
    ).toBe("article");
  });

  it("clamps the description before assigning it to top-level, openGraph, and twitter fields", () => {
    const short = entityMetadata({ title: "T", description: "Short.", path: "/x" });
    expect((short.description as string).length).toBeGreaterThanOrEqual(110);
    expect((short.description as string).length).toBeLessThanOrEqual(160);
    expect((short.openGraph as { description?: string }).description).toBe(short.description);
    expect((short.twitter as { description?: string }).description).toBe(short.description);
  });
});

describe("clampDescription", () => {
  it("passes through descriptions already in the 110-160 char range unchanged", () => {
    const inRange = "x".repeat(130);
    expect(clampDescription(inRange)).toBe(inRange);
  });

  it("truncates descriptions over 160 chars at a word boundary", () => {
    const long = "word ".repeat(50).trim(); // 249 chars
    const result = clampDescription(long);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith(" ")).toBe(false);
    expect(long.startsWith(result)).toBe(true);
  });

  it("pads descriptions under 110 chars to land within range", () => {
    const short = "A tiny description.";
    const result = clampDescription(short, "da");
    expect(result.length).toBeGreaterThanOrEqual(110);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.startsWith(short)).toBe(true);
  });

  it("uses the English padding suffix when lang is en", () => {
    const result = clampDescription("A tiny description.", "en");
    expect(result).toContain("Danish community");
  });

  it("leaves an empty description unchanged", () => {
    expect(clampDescription("")).toBe("");
  });

  it("truncates a short description's padding at the clause boundary, not mid-clause", () => {
    // 80 chars: short enough to need padding, long enough that description+pad exceeds 160.
    const short = "x".repeat(80);
    const result = clampDescription(short, "da");
    expect(result.length).toBeLessThanOrEqual(160);
    // Must not end mid-clause inside the pad's second half (after the em dash).
    expect(result.endsWith("vibetrends.dk")).toBe(true);
  });

  it("never splits a UTF-16 surrogate pair when truncating (no U+FFFD)", () => {
    const long = ("a".repeat(158) + "\u{1F600}\u{1F600}").normalize(); // emoji straddle the 160 cut
    const result = clampDescription(long);
    expect(result).not.toContain("�");
  });

  it("hard-cuts a single space-free token rather than throwing", () => {
    const long = "a".repeat(200);
    const result = clampDescription(long);
    expect(result.length).toBeLessThanOrEqual(160);
  });
});

describe("truncateTitle", () => {
  it("passes through titles that already fit the budget", () => {
    expect(truncateTitle("Short Title", 10)).toBe("Short Title");
  });

  it("truncates at a word boundary when the title plus suffix would exceed 60 chars", () => {
    const long = "GDPR Data Processing Agreement Generator"; // 41 chars
    const suffix = " - Skills Library"; // 18 chars; total with root template (16) would be 75
    const result = truncateTitle(long, suffix.length);
    expect((result + suffix).length).toBeLessThanOrEqual(44); // 60 - 16 (root template)
    expect(result.endsWith(" ")).toBe(false);
  });

  it("no-ops when suffixLength alone exhausts the budget, rather than throwing or emptying the title", () => {
    expect(truncateTitle("A Title", 50)).toBe("A Title");
  });
});
