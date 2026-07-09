import { describe, it, expect } from "vitest";
import { jsonLdScript, articleJsonLd, softwareAppJsonLd, breadcrumbJsonLd, forumThreadJsonLd, skillsListJsonLd } from "@/lib/jsonLd";

describe("jsonLdScript", () => {
  it("escapes '<' so a value cannot break out of the script element", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });
});

describe("articleJsonLd", () => {
  it("emits a valid Article with required fields, including image", () => {
    const a = articleJsonLd({
      title: "Post",
      description: "Desc",
      author: "Alice",
      url: "https://vibetrends.dk/blog/b1",
      image: "https://vibetrends.dk/images/post.jpg",
      datePublished: "2026-01-01",
    });
    expect(a["@type"]).toBe("Article");
    expect(a.headline).toBe("Post");
    expect(a.image).toBe("https://vibetrends.dk/images/post.jpg");
    expect(a.author).toEqual({ "@type": "Person", name: "Alice" });
    expect(a.url).toBe("https://vibetrends.dk/blog/b1");
    expect(a.datePublished).toBe("2026-01-01");
  });

  it("omits datePublished when not provided", () => {
    const a = articleJsonLd({ title: "P", description: "D", author: "A", url: "u", image: "img" });
    expect("datePublished" in a).toBe(false);
  });
});

describe("softwareAppJsonLd", () => {
  it("emits a valid SoftwareApplication with no fabricated offers or rating", () => {
    const s = softwareAppJsonLd({
      name: "Agent X",
      description: "Does things",
      developer: "Acme",
      url: "https://vibetrends.dk/agents/a1",
    });
    expect(s["@type"]).toBe("SoftwareApplication");
    expect(s.name).toBe("Agent X");
    expect(s.author).toEqual({ "@type": "Organization", name: "Acme" });
    expect("offers" in s).toBe(false);
    expect("aggregateRating" in s).toBe(false);
  });
});

describe("skillsListJsonLd", () => {
  it("includes codeRepositoryUrl when a skill has a githubUrl", () => {
    const list = skillsListJsonLd(
      [
        { title: "Skill A", description: "D", vibeCoder: "kasper", githubUrl: "https://github.com/x/a" },
        { title: "Skill B", description: "D", vibeCoder: "kasper" },
      ],
      "Skills",
      "desc",
    );
    expect(list.itemListElement[0].item.codeRepositoryUrl).toBe("https://github.com/x/a");
    expect("codeRepositoryUrl" in list.itemListElement[1].item).toBe(false);
  });
});

describe("breadcrumbJsonLd", () => {
  it("emits a BreadcrumbList with correct position and item fields", () => {
    const b = breadcrumbJsonLd([
      { name: "Showcase", url: "https://vibetrends.dk/vibes" },
      { name: "My Project", url: "https://vibetrends.dk/vibes/p1" },
    ]);
    expect(b["@type"]).toBe("BreadcrumbList");
    expect(b.itemListElement).toHaveLength(2);
    expect(b.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Showcase",
      item: "https://vibetrends.dk/vibes",
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
  it("emits a valid DiscussionForumPosting with all fields, including image", () => {
    const f = forumThreadJsonLd({
      title: "Bedste .cursorrules?",
      author: "kasper",
      url: "https://vibetrends.dk/forum/t1",
      image: "https://vibetrends.dk/images/og-default.jpg",
      datePublished: "2026-06-01",
    });
    expect(f["@type"]).toBe("DiscussionForumPosting");
    expect(f.headline).toBe("Bedste .cursorrules?");
    expect(f.image).toBe("https://vibetrends.dk/images/og-default.jpg");
    expect(f.author).toEqual({ "@type": "Person", name: "kasper" });
    expect(f.url).toBe("https://vibetrends.dk/forum/t1");
    expect(f.datePublished).toBe("2026-06-01");
  });

  it("omits datePublished when not provided", () => {
    const f = forumThreadJsonLd({ title: "T", author: "A", url: "u", image: "img" });
    expect("datePublished" in f).toBe(false);
  });

  it("passes through jsonLdScript without throwing", () => {
    const f = forumThreadJsonLd({ title: "</script>alert", author: "A", url: "u", image: "img" });
    expect(() => jsonLdScript(f)).not.toThrow();
    expect(jsonLdScript(f)).not.toContain("</script>");
  });
});
