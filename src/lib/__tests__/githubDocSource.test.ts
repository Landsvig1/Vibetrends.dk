import { describe, it, expect } from "vitest";
import {
  parseGithubDocSource,
  candidateDocPaths,
  docSourceUrl,
  truncateMarkdown,
  stripFrontmatter,
  skillSlugCandidates,
  pickDocPathFromTree,
  contentHash,
  planDocWrite,
  DOC_MAX_CHARS,
} from "../githubDocSource";

describe("parseGithubDocSource", () => {
  it("parses a bare repo URL as the repo root", () => {
    expect(parseGithubDocSource("https://github.com/pbakaus/impeccable")).toEqual({
      owner: "pbakaus",
      repo: "impeccable",
      ref: null,
      subpath: null,
    });
  });

  it("parses a /tree/<ref>/<subpath> URL", () => {
    expect(
      parseGithubDocSource("https://github.com/mikkelkrogsholm/dev-skills/tree/main/skill-creator")
    ).toEqual({
      owner: "mikkelkrogsholm",
      repo: "dev-skills",
      ref: "main",
      subpath: "skill-creator",
    });
  });

  it("parses a nested subpath", () => {
    expect(
      parseGithubDocSource("https://github.com/mikkelkrogsholm/skills/tree/main/skills/rejseplanen")
    ).toEqual({
      owner: "mikkelkrogsholm",
      repo: "skills",
      ref: "main",
      subpath: "skills/rejseplanen",
    });
  });

  it("treats a /blob/ URL naming a file as pointing at its directory", () => {
    expect(
      parseGithubDocSource("https://github.com/owner/repo/blob/main/skills/foo/SKILL.md")
    ).toEqual({ owner: "owner", repo: "repo", ref: "main", subpath: "skills/foo" });
  });

  it("keeps a /blob/ URL that names a directory", () => {
    expect(parseGithubDocSource("https://github.com/owner/repo/blob/main/skills/foo")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
      subpath: "skills/foo",
    });
  });

  it("handles trailing slashes, .git suffixes, query strings and fragments", () => {
    expect(parseGithubDocSource("https://github.com/owner/repo.git")).toMatchObject({
      repo: "repo",
      subpath: null,
    });
    expect(
      parseGithubDocSource("https://github.com/owner/repo/tree/main/dir?tab=readme#top")
    ).toMatchObject({ ref: "main", subpath: "dir" });
    expect(parseGithubDocSource("https://www.github.com/owner/repo/")).toMatchObject({
      owner: "owner",
      repo: "repo",
    });
  });

  it("degrades to the repo root for paths it cannot resolve", () => {
    // Not a tree/blob path — still a valid repo, just no subdirectory.
    expect(parseGithubDocSource("https://github.com/owner/repo/issues/12")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: null,
      subpath: null,
    });
    // A tree URL with no ref at all.
    expect(parseGithubDocSource("https://github.com/owner/repo/tree")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: null,
      subpath: null,
    });
  });

  it("refuses path traversal in the subpath, falling back to the ref root", () => {
    expect(
      parseGithubDocSource("https://github.com/owner/repo/tree/main/../../etc/passwd")
    ).toEqual({ owner: "owner", repo: "repo", ref: "main", subpath: null });
  });

  it("rejects non-GitHub and malformed URLs", () => {
    expect(parseGithubDocSource("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGithubDocSource("https://github.com/owner")).toBeNull();
    expect(parseGithubDocSource("not a url")).toBeNull();
    expect(parseGithubDocSource("")).toBeNull();
    expect(parseGithubDocSource(null)).toBeNull();
    expect(parseGithubDocSource(undefined)).toBeNull();
  });

  it("rejects owner/repo values GitHub could not serve", () => {
    expect(parseGithubDocSource("https://github.com/ow ner/repo")).toBeNull();
    expect(parseGithubDocSource("https://github.com/own$er/repo")).toBeNull();
    expect(parseGithubDocSource(`https://github.com/${"a".repeat(40)}/repo`)).toBeNull();
    expect(parseGithubDocSource(`https://github.com/owner/${"a".repeat(101)}`)).toBeNull();
  });

  it("rejects absurdly long URLs", () => {
    expect(parseGithubDocSource(`https://github.com/owner/repo/tree/main/${"a/".repeat(300)}`)).toBeNull();
  });
});

describe("candidateDocPaths", () => {
  it("searches only the subdirectory, never falling back to the repo root", () => {
    // A repo-root fallback here would give a skill inside a monorepo the shared
    // top-level README, which describes every sibling and not this skill.
    const source = parseGithubDocSource(
      "https://github.com/mikkelkrogsholm/dev-skills/tree/main/skill-creator"
    )!;
    expect(candidateDocPaths(source)).toEqual([
      "skill-creator/SKILL.md",
      "skill-creator/README.md",
      "skill-creator/readme.md",
    ]);
  });

  it("still offers the repo root for a URL whose trailing path was unparseable", () => {
    // parseGithubDocSource degrades these to subpath: null on purpose, and that
    // leniency must keep resolving the root README.
    const source = parseGithubDocSource("https://github.com/pbakaus/impeccable/issues/12")!;
    expect(source.subpath).toBeNull();
    expect(candidateDocPaths(source)).toEqual(["SKILL.md", "README.md", "readme.md"]);
  });

  it("prefers SKILL.md over README.md at the repo root", () => {
    const source = parseGithubDocSource("https://github.com/pbakaus/impeccable")!;
    expect(candidateDocPaths(source)).toEqual(["SKILL.md", "README.md", "readme.md"]);
  });
});

describe("docSourceUrl", () => {
  it("builds a blob URL using the parsed ref", () => {
    const source = parseGithubDocSource("https://github.com/owner/repo/tree/v2/dir")!;
    expect(docSourceUrl(source, "dir/SKILL.md")).toBe(
      "https://github.com/owner/repo/blob/v2/dir/SKILL.md"
    );
  });

  it("falls back to HEAD when the URL carried no ref", () => {
    const source = parseGithubDocSource("https://github.com/owner/repo")!;
    expect(docSourceUrl(source, "README.md")).toBe(
      "https://github.com/owner/repo/blob/HEAD/README.md"
    );
  });
});

describe("truncateMarkdown", () => {
  it("leaves short documents untouched", () => {
    const md = "# Title\n\nA short doc.";
    expect(truncateMarkdown(md, 1000)).toEqual({ markdown: md, truncated: false });
  });

  it("normalizes CRLF and trims without flagging truncation", () => {
    expect(truncateMarkdown("  # Title\r\n\r\nBody\r\n  ", 1000)).toEqual({
      markdown: "# Title\n\nBody",
      truncated: false,
    });
  });

  it("cuts at a paragraph boundary and reports truncation", () => {
    const md = ["# Title", "", "A".repeat(100), "", "B".repeat(100), "", "C".repeat(100)].join("\n");
    const result = truncateMarkdown(md, 150);
    expect(result.truncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(150);
    // Boundary respected: no half-paragraph left behind.
    expect(result.markdown).toBe(`# Title\n\n${"A".repeat(100)}`);
  });

  it("never leaves an unterminated code fence", () => {
    const md = ["# Title", "", "Intro paragraph.", "", "```js", "x".repeat(400), "```", "", "tail"].join("\n");
    const result = truncateMarkdown(md, 120);
    expect(result.truncated).toBe(true);
    const fences = result.markdown.match(/^[ \t]*```/gm) ?? [];
    expect(fences.length % 2).toBe(0);
    expect(result.markdown).toBe("# Title\n\nIntro paragraph.");
  });

  it("keeps a complete fenced block that fits", () => {
    const md = ["# T", "", "```sh", "npm i", "```", "", "x".repeat(500)].join("\n");
    const result = truncateMarkdown(md, 60);
    expect(result.truncated).toBe(true);
    expect(result.markdown).toContain("```sh");
    expect((result.markdown.match(/```/g) ?? []).length).toBe(2);
  });

  it("falls back to a line boundary when there is no blank line", () => {
    const md = Array.from({ length: 40 }, (_, i) => `- item ${i}`).join("\n");
    const result = truncateMarkdown(md, 100);
    expect(result.truncated).toBe(true);
    expect(result.markdown.endsWith("\n")).toBe(false);
    expect(result.markdown.split("\n").every((l) => /^- item \d+$/.test(l))).toBe(true);
  });

  it("hard-cuts when no boundary exists in the back half", () => {
    const md = "x".repeat(500);
    const result = truncateMarkdown(md, 100);
    expect(result).toEqual({ markdown: "x".repeat(100), truncated: true });
  });

  it("defaults to DOC_MAX_CHARS", () => {
    const result = truncateMarkdown("y".repeat(DOC_MAX_CHARS + 10));
    expect(result.truncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(DOC_MAX_CHARS);
  });
});

describe("stripFrontmatter", () => {
  it("removes a leading YAML block", () => {
    const md = "---\nname: skill-creator\ndescription: Guide\n---\n\n# Skill Creator\n\nBody.";
    expect(stripFrontmatter(md)).toBe("# Skill Creator\n\nBody.");
  });

  it("handles a frontmatter block with no trailing blank line", () => {
    expect(stripFrontmatter("---\nname: x\n---\n# T")).toBe("# T");
  });

  it("leaves a thematic break further down the document alone", () => {
    const md = "# Title\n\n---\n\nAfter the rule.";
    expect(stripFrontmatter(md)).toBe(md);
  });

  it("leaves documents without frontmatter untouched", () => {
    expect(stripFrontmatter("# Title\n\nBody.")).toBe("# Title\n\nBody.");
    expect(stripFrontmatter("")).toBe("");
  });

  it("is idempotent", () => {
    const md = "---\nname: x\n---\n\n# T";
    expect(stripFrontmatter(stripFrontmatter(md))).toBe(stripFrontmatter(md));
  });
});

describe("skillSlugCandidates", () => {
  it("derives a slug from a seed id", () => {
    expect(skillSlugCandidates("seed_copywriting", "Copywriting")).toContain("copywriting");
  });

  it("offers the id slug without its leading vendor word", () => {
    const candidates = skillSlugCandidates("seed_vercel-composition-patterns", "Composition Patterns");
    expect(candidates[0]).toBe("vercel-composition-patterns");
    expect(candidates).toContain("composition-patterns");
  });

  it("falls back to the title for generated s_<epoch> ids", () => {
    expect(skillSlugCandidates("s_1783441219813", "Smoke and Mirrors: UI Prototyping")).toEqual([
      "smoke-and-mirrors-ui-prototyping",
    ]);
  });

  it("offers an apostrophe-stripped slug alongside the separator form", () => {
    const candidates = skillSlugCandidates("s_1783441213578", "Let's Talk");
    expect(candidates).toContain("let-s-talk");
    expect(candidates).toContain("lets-talk");
  });

  it("strips the typographic apostrophe too", () => {
    expect(skillSlugCandidates("s_1783441213578", "Let’s Talk")).toContain("lets-talk");
  });

  it("returns nothing usable when there is no signal", () => {
    expect(skillSlugCandidates("s_123", null)).toEqual([]);
  });
});

describe("pickDocPathFromTree", () => {
  const tree = [
    "README.md",
    "skills/copywriting/SKILL.md",
    "skills/seo-audit/SKILL.md",
    "plugins/expo/skills/copywriting/SKILL.md",
    "docs/notes.md",
  ];

  it("matches on the containing directory name", () => {
    expect(pickDocPathFromTree(tree, ["seo-audit"])).toBe("skills/seo-audit/SKILL.md");
  });

  it("prefers the shallowest path when several directories match", () => {
    expect(pickDocPathFromTree(tree, ["copywriting"])).toBe("skills/copywriting/SKILL.md");
  });

  it("respects candidate order over path depth", () => {
    expect(pickDocPathFromTree(tree, ["seo-audit", "copywriting"])).toBe("skills/seo-audit/SKILL.md");
  });

  it("returns null rather than guessing", () => {
    expect(pickDocPathFromTree(tree, ["polish"])).toBeNull();
    expect(pickDocPathFromTree(tree, [])).toBeNull();
    // A partial name match must not count.
    expect(pickDocPathFromTree(tree, ["copy"])).toBeNull();
  });

  it("ignores a root-level SKILL.md, which is not skill-specific", () => {
    expect(pickDocPathFromTree(["SKILL.md"], ["anything"])).toBeNull();
  });
});

/**
 * The composed pipeline the refresher runs: strip frontmatter, truncate, hash.
 * Asserted as a pipeline rather than on contentHash alone because the property
 * that matters is "the hash covers what the page renders", and that only holds
 * for this composition.
 */
function renderedHash(raw: string, maxChars: number = DOC_MAX_CHARS): string {
  return contentHash(truncateMarkdown(stripFrontmatter(raw), maxChars).markdown);
}

describe("contentHash", () => {
  it("is stable across calls for the same input", () => {
    const md = "# Title\n\nSome body text.";
    expect(contentHash(md)).toBe(contentHash(md));
  });

  it("returns a sha256 hex digest", () => {
    expect(contentHash("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for a one-character change", () => {
    expect(contentHash("# Title\n\nBody.")).not.toBe(contentHash("# Title\n\nBodz."));
  });

  it("distinguishes empty from whitespace", () => {
    expect(contentHash("")).not.toBe(contentHash(" "));
  });

  // The reason the hash covers the rendered string and not the raw file: an
  // upstream edit to the YAML header changes the bytes but not one character of
  // the page, and stamping a content-change date for it is exactly the noise
  // content_updated_at exists to remove.
  it("ignores a frontmatter-only upstream edit", () => {
    const before = "---\nname: thing\nversion: 1\n---\n\n# Doc\n\nBody text.";
    const after = "---\nname: thing\nversion: 2\nlicense: MIT\n---\n\n# Doc\n\nBody text.";
    expect(renderedHash(before)).toBe(renderedHash(after));
  });

  it("still detects a body edit under identical frontmatter", () => {
    const before = "---\nname: thing\n---\n\n# Doc\n\nBody text.";
    const after = "---\nname: thing\n---\n\n# Doc\n\nBody text, revised.";
    expect(renderedHash(before)).not.toBe(renderedHash(after));
  });

  // An upstream change entirely past the truncation cap never reaches the page.
  it("ignores an upstream change beyond the truncation cap", () => {
    const head = "# Doc\n\n" + "kept paragraph.\n\n".repeat(20);
    const before = head + "tail one.";
    const after = head + "tail two, materially different.";
    const cap = 120;
    expect(truncateMarkdown(before, cap).truncated).toBe(true);
    expect(renderedHash(before, cap)).toBe(renderedHash(after, cap));
  });
});

describe("planDocWrite", () => {
  const HASH_A = contentHash("a");
  const HASH_B = contentHash("b");

  it("writes nothing new when the hash is unchanged", () => {
    expect(planDocWrite(HASH_A, HASH_A)).toEqual({
      branch: "contentUnchanged",
      writeContent: false,
      stampContentUpdatedAt: false,
    });
  });

  // The whole table passes through here exactly once, at the migration. Stamping
  // content_updated_at on this branch would overwrite every seeded creation date
  // with one shared run date — the bug being fixed, reintroduced.
  it("initializes a null hash without touching content_updated_at", () => {
    expect(planDocWrite(HASH_A, null)).toEqual({
      branch: "hashInitialized",
      writeContent: true,
      stampContentUpdatedAt: false,
    });
    expect(planDocWrite(HASH_A, undefined).branch).toBe("hashInitialized");
    // An empty string is a corrupt hash, not a real one — treat it as absent.
    expect(planDocWrite(HASH_A, "").branch).toBe("hashInitialized");
  });

  it("stamps content_updated_at only when a real hash changed", () => {
    expect(planDocWrite(HASH_B, HASH_A)).toEqual({
      branch: "contentChanged",
      writeContent: true,
      stampContentUpdatedAt: true,
    });
  });

  // A revert is a content change: the page differs from what it served
  // yesterday, even though the hash returns to a value it held before.
  it("treats a revert to an earlier version as a change", () => {
    expect(planDocWrite(HASH_A, HASH_B).stampContentUpdatedAt).toBe(true);
  });

  it("maps each branch to a distinct counter name", () => {
    const branches = [
      planDocWrite(HASH_A, HASH_A).branch,
      planDocWrite(HASH_A, null).branch,
      planDocWrite(HASH_B, HASH_A).branch,
    ];
    expect(new Set(branches).size).toBe(3);
  });
});
