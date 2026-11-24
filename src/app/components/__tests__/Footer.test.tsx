import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Footer from "../Footer";

describe("Footer", () => {
  it("links every hub when nothing is hidden", () => {
    const html = renderToStaticMarkup(<Footer />);
    expect(html).toContain('href="/forum"');
    expect(html).toContain('href="/blog"');
  });

  it("drops the hubs the header hides", () => {
    // Same list the header gets from hiddenNavHrefs, so the footer cannot keep
    // linking a hub the nav has hidden.
    const html = renderToStaticMarkup(<Footer hiddenHrefs={["/forum", "/blog"]} />);
    expect(html).not.toContain('href="/forum"');
    expect(html).not.toContain('href="/blog"');
    expect(html).toContain('href="/skills"');
    expect(html).toContain('href="/about"');
  });
});
