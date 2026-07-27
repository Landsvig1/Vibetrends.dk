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

  it("assigns the same clamped description to top-level, openGraph, and twitter fields", () => {
    const long = entityMetadata({ title: "T", description: "word ".repeat(50).trim(), path: "/x" });
    expect((long.description as string).length).toBeLessThanOrEqual(160);
    expect((long.openGraph as { description?: string }).description).toBe(long.description);
    expect((long.twitter as { description?: string }).description).toBe(long.description);
  });

  it("passes a short description through untouched, in every field", () => {
    const short = entityMetadata({ title: "T", description: "Short.", path: "/x" });
    expect(short.description).toBe("Short.");
    expect((short.openGraph as { description?: string }).description).toBe("Short.");
    expect((short.twitter as { description?: string }).description).toBe("Short.");
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

  // There is deliberately no minimum length — see clampDescription's doc comment.
  // These two pin that: the old padding produced garbled run-ons on every one of
  // the 108 live descriptions it touched, so short input must survive verbatim.
  it("leaves a short description exactly as-is rather than padding it", () => {
    const short = "A tiny description.";
    expect(clampDescription(short)).toBe(short);
  });

  it("never appends site boilerplate to a short description", () => {
    const short = "Full browser automation: navigate, click, fill forms, extract data, and screenshot";
    const result = clampDescription(short);
    expect(result).toBe(short);
    expect(result).not.toContain("vibetrends.dk");
  });

  it("leaves an empty description unchanged", () => {
    expect(clampDescription("")).toBe("");
  });

  it("keeps most of the budget when the first sentence ends early", () => {
    // Real row (176 chars) that the unbounded sentence-rewind cut down to 89.
    const real =
      "A REST API that gives developers and AI agents access to Danish CVR company registry data. " +
      "Lookup by CVR number, name, or address, with structured JSON responses for agents.";
    expect(real.length).toBeGreaterThan(160); // fixture must actually need truncating
    const result = clampDescription(real);
    expect(result.length).toBeLessThanOrEqual(160);
    // The old behaviour returned just the 89-char opening sentence.
    expect(result.length).toBeGreaterThan(120);
    expect(real.startsWith(result)).toBe(true);
  });

  it("still cuts back to a late sentence boundary when one keeps the budget", () => {
    const text = "x".repeat(120) + ". " + "y".repeat(60);
    const result = clampDescription(text);
    expect(result).toBe("x".repeat(120) + ".");
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
