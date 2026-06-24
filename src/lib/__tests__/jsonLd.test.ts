import { describe, it, expect } from "vitest";
import { jsonLdScript, articleJsonLd, softwareAppJsonLd, breadcrumbJsonLd, forumThreadJsonLd } from "@/lib/jsonLd";

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

describe("breadcrumbJsonLd", () => {
  it("emits a BreadcrumbList with correct position and item fields", () => {
    const b = breadcrumbJsonLd([
      { name: "Showcase", url: "https://vibetrends.dk/showcase" },
      { name: "My Project", url: "https://vibetrends.dk/showcase/p1" },
    ]);
    expect(b["@type"]).toBe("BreadcrumbList");
    expect(b.itemListElement).toHaveLength(2);
    expect(b.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Showcase",
      item: "https://vibetrends.dk/showcase",
    });
    expect(b.itemListElement[1].position).toBe(2);
    expect(b.itemListElement[1].name).toBe("My Project");
  });

  it("works with a single item", () => {
    const b = breadcrumbJsonLd([{ name: "Home", url: "https://vibetrends.dk" }]);
    expect(b.itemListElement).toHaveLength(1);
    expect(b.itemListElement[0].position).toBe(1);
  });

  it("passes through jsonLdScript without throwing", () => {
    const b = breadcrumbJsonLd([{ name: "</script>", url: "https://vibetrends.dk/x" }]);
    expect(() => jsonLdScript(b)).not.toThrow();
    expect(jsonLdScript(b)).not.toContain("</script>");
  });
});

describe("forumThreadJsonLd", () => {
  it("emits a valid DiscussionForumPosting with all fields", () => {
    const f = forumThreadJsonLd({
      title: "Bedste .cursorrules?",
      author: "kasper",
      url: "https://vibetrends.dk/forum/t1",
      datePublished: "2026-06-01",
    });
    expect(f["@type"]).toBe("DiscussionForumPosting");
    expect(f.headline).toBe("Bedste .cursorrules?");
    expect(f.author).toEqual({ "@type": "Person", name: "kasper" });
    expect(f.url).toBe("https://vibetrends.dk/forum/t1");
    expect(f.datePublished).toBe("2026-06-01");
  });

  it("omits datePublished when not provided", () => {
    const f = forumThreadJsonLd({ title: "T", author: "A", url: "u" });
    expect("datePublished" in f).toBe(false);
  });

  it("passes through jsonLdScript without throwing", () => {
    const f = forumThreadJsonLd({ title: "</script>alert", author: "A", url: "u" });
    expect(() => jsonLdScript(f)).not.toThrow();
    expect(jsonLdScript(f)).not.toContain("</script>");
  });
});
