import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { stripFrontmatter } from "./githubDocSource";

/**
 * Rendering third-party markdown (SKILL.md / README.md pulled from arbitrary
 * GitHub repos) as HTML on vibetrends.dk.
 *
 * The content is untrusted: anyone whose repo we link to can put anything in it,
 * and markdown passes raw HTML straight through. So marked's output is treated
 * as hostile and run through an allowlist sanitizer before it reaches a page.
 *
 * Only ever called from an async Server Component, so marked + sanitize-html
 * stay out of the client bundle. Keep it that way — importing this from a
 * "use client" module would ship both libraries to the browser.
 *
 * ## Images are stripped, deliberately
 *
 * READMEs are full of badges and screenshots from raw.githubusercontent.com,
 * img.shields.io, badgen, codecov, and whatever else the author used. Rendering
 * them would require adding those hosts to `img-src` in next.config.ts, which is
 * a site-wide CSP relaxation — and one that hands every repo we index the ability
 * to place a request-logging beacon on our domain (an <img> fetch leaks the
 * visitor's IP, UA and Referer to that host on every page view). Badges also
 * carry no information for a reader of a skill detail page.
 *
 * So: no <img> in the allowlist, and no new img-src hosts. `alt` text is dropped
 * with the tag rather than surfaced, since badge alt text ("build passing",
 * "npm version") is noise. The link back to the source repo is where a reader
 * goes for the rendered-with-images version.
 *
 * ## Other decisions
 *
 * - Headings are demoted one level: the page already owns <h1>, so a README's
 *   <h1> becomes <h2> and the document outline stays valid.
 * - Relative links (`./CONTRIBUTING.md`, `docs/x.md`) resolve against the file's
 *   URL on GitHub. Unresolved, they would point at vibetrends.dk paths that
 *   don't exist.
 * - Anchor-only links (`#usage`) are dropped to plain text: the heading ids they
 *   target are not emitted here.
 * - Every surviving link is external, so all get rel="nofollow noopener
 *   noreferrer" — we are not passing link equity to arbitrary third parties.
 */

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote",
  "pre", "code",
  "strong", "em", "del", "sup", "sub",
  "a",
  "table", "thead", "tbody", "tr", "th", "td",
];

const HEADING_DEMOTION: Record<string, string> = {
  h1: "h2",
  h2: "h3",
  h3: "h4",
  h4: "h5",
  h5: "h6",
  h6: "h6",
};

function resolveHref(href: string, baseUrl: string | null): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  // Anchor-only links target heading ids we do not render.
  if (trimmed.startsWith("#")) return null;

  try {
    const absolute = new URL(trimmed, baseUrl ?? undefined);
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:" && absolute.protocol !== "mailto:") {
      return null;
    }
    return absolute.toString();
  } catch {
    return null;
  }
}

/**
 * Render untrusted markdown to sanitized HTML.
 *
 * @param markdown  raw markdown from the source repo
 * @param sourceUrl the file's github.com/blob URL, used as the base for
 *                  relative links. Pass null to drop relative links entirely.
 */
export function renderSkillDocHtml(markdown: string, sourceUrl: string | null): string {
  // Relative links resolve against the raw file so sibling paths work; the
  // /blob/ URL would resolve `./x.md` to a page that exists, which is nicer.
  const base = sourceUrl;

  // The refresh script already strips frontmatter before storing; repeating it
  // here (idempotent) means a row written by hand or before that fix still
  // renders correctly rather than opening with a block of raw YAML.
  const source = stripFrontmatter(markdown);

  const rawHtml = marked.parse(source, { async: false, gfm: true, breaks: false }) as string;

  const clean = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "rel", "target"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      code: ["class"], // language-* from fenced blocks; harmless and useful for styling
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    disallowedTagsMode: "discard",
    // Class values are attacker-controlled; keep only the language hint.
    allowedClasses: { code: ["language-*"] },
    transformTags: {
      ...HEADING_DEMOTION,
      a: (tagName, attribs): sanitizeHtml.Tag => {
        const href = resolveHref(attribs.href ?? "", base);
        // Keep the link text, lose the link.
        if (!href) return { tagName: "span", attribs: {} };
        return {
          tagName: "a",
          attribs: { href, rel: "nofollow noopener noreferrer", target: "_blank" },
        };
      },
    },
  });

  return dropEmptyWrappers(clean);
}

/**
 * Badge rows (`[![build](shields.io/…)](ci-url)`) sanitize down to `<p><a></a></p>`
 * once the images are gone, which renders as a mystery gap. Strip anchors, list
 * items and paragraphs that ended up with no content, innermost first.
 *
 * Done as a post-pass rather than with sanitize-html's `exclusiveFilter`, whose
 * `frame.text` only sees a tag's direct text — it would also delete
 * `<p><code>x</code></p>`.
 */
function dropEmptyWrappers(html: string): string {
  const EMPTY = /<(a|p|li)\b[^>]*>\s*<\/\1>/g;
  let out = html;
  for (let i = 0; i < 5; i++) {
    const next = out.replace(EMPTY, "");
    if (next === out) break;
    out = next;
  }
  return out;
}
