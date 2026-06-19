import { describe, it, expect } from "vitest";
import { jsonLdScript, articleJsonLd, softwareAppJsonLd } from "@/lib/jsonLd";

describe("jsonLdScript", () => {
  it("escapes '<' so a value cannot break out of the script element", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });
});

describe("articleJsonLd", () => {
  it("emits a valid Article with required fields", () => {
    const a = articleJsonLd({
      title: "Post",
      description: "Desc",
      author: "Alice",
      url: "https://vibetrends.dk/blog/b1",
      datePublished: "2026-01-01",
    });
    expect(a["@type"]).toBe("Article");
    expect(a.headline).toBe("Post");
    expect(a.author).toEqual({ "@type": "Person", name: "Alice" });
    expect(a.url).toBe("https://vibetrends.dk/blog/b1");
    expect(a.datePublished).toBe("2026-01-01");
  });

  it("omits datePublished when not provided", () => {
    const a = articleJsonLd({ title: "P", description: "D", author: "A", url: "u" });
    expect("datePublished" in a).toBe(false);
  });
});

describe("softwareAppJsonLd", () => {
  it("emits a valid SoftwareApplication with a free offer", () => {
    const s = softwareAppJsonLd({
      name: "Agent X",
      description: "Does things",
      developer: "Acme",
      url: "https://vibetrends.dk/agents/a1",
    });
    expect(s["@type"]).toBe("SoftwareApplication");
    expect(s.name).toBe("Agent X");
    expect(s.author).toEqual({ "@type": "Organization", name: "Acme" });
    expect(s.offers).toMatchObject({ price: "0", priceCurrency: "USD" });
  });
});
