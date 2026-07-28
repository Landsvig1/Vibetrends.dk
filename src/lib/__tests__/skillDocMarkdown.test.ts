import { describe, it, expect } from "vitest";
import { renderSkillDocHtml } from "../skillDocMarkdown";

const BASE = "https://github.com/owner/repo/blob/main/skills/foo/SKILL.md";

describe("renderSkillDocHtml — sanitization", () => {
  it("strips script tags and their contents", () => {
    const html = renderSkillDocHtml("Hi\n\n<script>alert(1)</script>\n", BASE);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
  });

  it("strips inline event handlers", () => {
    const html = renderSkillDocHtml('<p onclick="steal()">click</p>', BASE);
    expect(html).not.toContain("onclick");
    expect(html).toContain("click");
  });

  it("strips iframes, objects, embeds, forms and style blocks", () => {
    const html = renderSkillDocHtml(
      '<iframe src="https://evil.example"></iframe>' +
        '<object data="x"></object><embed src="x">' +
        '<form action="https://evil.example"><input name="pw"></form>' +
        "<style>body{display:none}</style>",
      BASE
    );
    for (const tag of ["iframe", "object", "embed", "form", "input", "style"]) {
      expect(html).not.toContain(`<${tag}`);
    }
    expect(html).not.toContain("display:none");
  });

  it("drops javascript: and data: URLs on links", () => {
    const html = renderSkillDocHtml(
      "[x](javascript:alert(1)) [y](data:text/html;base64,PHNjcmlwdD4=)",
      BASE
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    // The link text survives as plain text.
    expect(html).toContain("x");
    expect(html).toContain("y");
  });

  it("strips style attributes", () => {
    const html = renderSkillDocHtml('<p style="position:fixed;top:0">overlay</p>', BASE);
    expect(html).not.toContain("style=");
  });

  it("keeps only the language class on code elements", () => {
    const html = renderSkillDocHtml("```js\nconst a = 1;\n```", BASE);
    expect(html).toContain("language-js");
    const withEvilClass = renderSkillDocHtml('<code class="fixed inset-0 z-50">x</code>', BASE);
    expect(withEvilClass).not.toContain("inset-0");
  });
});

describe("renderSkillDocHtml — images", () => {
  it("removes markdown images rather than loading third-party hosts", () => {
    const html = renderSkillDocHtml("![build](https://img.shields.io/badge/build-passing.svg)", BASE);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("shields.io");
  });

  it("removes raw <img> tags too", () => {
    const html = renderSkillDocHtml(
      '<img src="https://raw.githubusercontent.com/o/r/main/screenshot.png">',
      BASE
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("raw.githubusercontent.com");
  });

  it("leaves no empty anchor or paragraph behind from a badge row", () => {
    const html = renderSkillDocHtml(
      "[![build](https://img.shields.io/b.svg)](https://ci.example/x)\n",
      BASE
    );
    expect(html).not.toMatch(/<a[^>]*>\s*<\/a>/);
    expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
  });

  it("keeps a paragraph whose only child is an element with text", () => {
    const html = renderSkillDocHtml("`npm install`\n", BASE);
    expect(html).toContain("<code>npm install</code>");
    expect(html).toContain("<p>");
  });
});

describe("renderSkillDocHtml — links", () => {
  it("resolves relative links against the source file", () => {
    const html = renderSkillDocHtml("[contributing](../CONTRIBUTING.md)", BASE);
    expect(html).toContain('href="https://github.com/owner/repo/blob/main/skills/CONTRIBUTING.md"');
  });

  it("marks every surviving link external and untrusted", () => {
    const html = renderSkillDocHtml("[docs](https://example.com/docs)", BASE);
    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("drops anchor-only links to plain text", () => {
    const html = renderSkillDocHtml("[Usage](#usage)", BASE);
    expect(html).not.toContain("<a");
    expect(html).toContain("Usage");
  });

  it("drops relative links when there is no base URL", () => {
    const html = renderSkillDocHtml("[x](./other.md)", null);
    expect(html).not.toContain("<a");
    expect(html).toContain("x");
  });

  it("keeps mailto links", () => {
    const html = renderSkillDocHtml("[mail](mailto:a@b.example)", BASE);
    expect(html).toContain("mailto:a@b.example");
  });
});

describe("renderSkillDocHtml — structure", () => {
  it("demotes headings by one level so the page keeps a single h1", () => {
    const html = renderSkillDocHtml("# Top\n\n## Second\n\n###### Deepest", BASE);
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2>Top</h2>");
    expect(html).toContain("<h3>Second</h3>");
    expect(html).toContain("<h6>Deepest</h6>");
  });

  it("renders GFM tables, lists and blockquotes", () => {
    const html = renderSkillDocHtml(
      "| a | b |\n| - | - |\n| 1 | 2 |\n\n- one\n- two\n\n> quoted",
      BASE
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<blockquote>");
  });

  it("strips YAML frontmatter that reached the renderer unstripped", () => {
    const html = renderSkillDocHtml("---\nname: x\ndescription: y\n---\n\n# Title\n", BASE);
    expect(html).not.toContain("description: y");
    expect(html).toContain("<h2>Title</h2>");
  });

  it("returns an empty string for empty input", () => {
    expect(renderSkillDocHtml("", BASE).trim()).toBe("");
  });
});
