// Resolving a skill's `github_url` to the file that documents it.
//
// Two URL shapes exist in the `skills` table today (101 rows, 46 of them the
// second shape):
//
//   https://github.com/pbakaus/impeccable                                 -> repo root
//   https://github.com/mikkelkrogsholm/dev-skills/tree/main/skill-creator -> subdirectory
//
// This module has no RELATIVE imports on purpose: scripts/refresh-skill-docs.mjs
// loads it directly through Node's built-in TypeScript type stripping, and Node's
// ESM resolver would not follow an extensionless relative import from it. A bare
// `node:` builtin (see contentHash below) resolves fine and is the one exception.
// src/lib/github.ts's parseGithubRepoUrl delegates here, so owner/repo validation
// still lives in exactly one place.

import { createHash } from "node:crypto";

export interface GithubDocSource {
  owner: string;
  repo: string;
  /** Branch/tag/sha from a /tree/<ref>/ or /blob/<ref>/ URL; null for a bare repo URL. */
  ref: string | null;
  /** Directory within the repo the skill lives in; null when it is the repo root. */
  subpath: string | null;
}

// GitHub usernames are alphanumeric + hyphen; repo names also allow underscore
// and period. Both are length-capped by GitHub (39 / 100).
const OWNER_REGEX = /^[a-zA-Z0-9-]+$/;
const REPO_REGEX = /^[a-zA-Z0-9-_.]+$/;

/** A path segment GitHub could actually serve. Rejects traversal and absolute paths. */
const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

function validSegments(segments: string[]): boolean {
  return segments.every((s) => s !== "." && s !== ".." && SEGMENT_REGEX.test(s));
}

/**
 * Parse a skill's GitHub URL into the repo coordinates plus the subdirectory
 * (if any) the skill lives in. Returns null for anything that isn't a
 * github.com repo URL.
 *
 * A `/blob/<ref>/<dir>/SKILL.md` URL is treated as pointing at its containing
 * directory — the caller re-derives the candidate filenames itself, so a URL
 * that already names the file and one that names its folder resolve alike.
 *
 * A trailing path we can't make sense of (`/issues/12`, a segment with
 * characters GitHub wouldn't serve) degrades to the repo root rather than
 * failing: the root README is still a reasonable thing to show, and
 * parseGithubRepoUrl's callers rely on that leniency.
 */
export function parseGithubDocSource(url: string | null | undefined): GithubDocSource | null {
  if (typeof url !== "string") return null;
  // Cap overall length to prevent ReDoS and resource exhaustion.
  if (url.length > 500) return null;

  // Strip query and hash first, so neither can smuggle path segments.
  const cleanUrl = url.split(/[?#]/)[0];

  const match = cleanUrl.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/(.*))?$/
  );
  if (!match) return null;

  const [, owner, repo, rest = ""] = match;
  if (!OWNER_REGEX.test(owner) || !REPO_REGEX.test(repo)) return null;
  if (owner.length > 39 || repo.length > 100) return null;

  const root: GithubDocSource = { owner, repo, ref: null, subpath: null };

  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 0) return root;

  const kind = parts[0];
  if (kind !== "tree" && kind !== "blob") return root;

  const ref = parts[1] ?? null;
  if (ref === null || !SEGMENT_REGEX.test(ref)) return root;

  let tail = parts.slice(2);
  // /blob/<ref>/<dir>/SKILL.md names the file; we want its directory.
  if (kind === "blob" && tail.length > 0 && tail[tail.length - 1].includes(".")) {
    tail = tail.slice(0, -1);
  }

  if (tail.length === 0) return { owner, repo, ref, subpath: null };
  if (!validSegments(tail)) return { owner, repo, ref, subpath: null };

  return { owner, repo, ref, subpath: tail.join("/") };
}

/**
 * Ordered list of paths to try for a skill's documentation. SKILL.md is the
 * Anthropic skill manifest and is by far the better page content when present;
 * README.md is the fallback.
 *
 * When the URL names a subdirectory, ONLY that subdirectory is searched — there
 * is deliberately no fall back to the repo root. A URL naming a folder is an
 * assertion that the skill lives there, and 46 of 101 rows point into monorepos
 * of skills where the root README describes every sibling at once. Falling back
 * would hand this page a doc about 49 other skills, which is the near-duplicate
 * problem this feature exists to remove; showing no doc is the honest outcome
 * and the page renders fine without one.
 *
 * This does not weaken the lenient repo-root behaviour parseGithubRepoUrl's
 * callers rely on: a URL whose trailing path can't be parsed comes back with
 * subpath: null and still gets the root candidates.
 */
export function candidateDocPaths(source: GithubDocSource): string[] {
  const names = ["SKILL.md", "README.md", "readme.md"];
  const prefix = source.subpath;
  return names.map((name) => (prefix ? `${prefix}/${name}` : name));
}

/**
 * Directory names a skill might live under inside a monorepo of skills.
 *
 * Needed because many rows point at a repo *root* that actually contains dozens
 * of skills — coreyhaines31/marketingskills has 49 SKILL.md files, obra/superpowers
 * has 14. Falling back to the root README gave 29 of 101 skills text identical to
 * a sibling's, which is the near-duplicate problem this whole feature exists to
 * remove. Matching the skill to its own directory fixes 28 of those 29.
 *
 * Candidates, in preference order:
 *   1. the id's slug (`seed_copywriting` -> `copywriting`)
 *   2. that slug minus a leading vendor word (`vercel-composition-patterns`
 *      -> `composition-patterns`, since the repo names the folder without the
 *      vendor prefix)
 *   3. the title, slugified (the only signal for `s_<epoch>` ids)
 */
export function skillSlugCandidates(id: string, title?: string | null): string[] {
  const out: string[] = [];
  const push = (v: string | null | undefined) => {
    if (v && !out.includes(v)) out.push(v);
  };

  const idSlug = /^s_\d+$/.test(id) ? "" : id.replace(/^seed_/, "").toLowerCase();
  push(idSlug);
  const parts = idSlug.split("-");
  if (parts.length > 1) push(parts.slice(1).join("-"));

  const lowerTitle = (title ?? "").toLowerCase();
  const slugify = (v: string) => v.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  push(slugify(lowerTitle));
  // Same title with apostrophes removed rather than turned into a separator:
  // "Let's Talk" slugifies to `let-s-talk`, but a repo names that folder
  // `lets-talk`. Offered as an extra candidate rather than a replacement so
  // nothing that matches on the first form can regress. Covers the typographic
  // apostrophe too — titles get pasted in from READMEs.
  push(slugify(lowerTitle.replace(/['’]/g, "")));

  return out.filter(Boolean);
}

/**
 * Given every SKILL.md path in a repo, pick the one belonging to this skill.
 *
 * Deliberately strict: only an exact match on the file's containing directory
 * name counts. Fuzzy matching here would silently attach the wrong skill's
 * documentation to a page, which is worse than falling back to the root README.
 * Candidates are tried in order, so the id-derived slug beats the title-derived
 * one; ties within a candidate go to the shallowest path.
 */
export function pickDocPathFromTree(paths: string[], candidates: string[]): string | null {
  const skillFiles = paths.filter((p) => p.endsWith("/SKILL.md"));
  for (const candidate of candidates) {
    const matches = skillFiles.filter((p) => {
      const segments = p.split("/");
      return segments[segments.length - 2] === candidate;
    });
    if (matches.length > 0) {
      return matches.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0];
    }
  }
  return null;
}

/** Canonical https URL for a resolved doc file, used for attribution links. */
export function docSourceUrl(source: GithubDocSource, path: string): string {
  const ref = source.ref ?? "HEAD";
  return `https://github.com/${source.owner}/${source.repo}/blob/${ref}/${path}`;
}

/**
 * Remove a leading YAML frontmatter block.
 *
 * Every SKILL.md opens with one, and markdown has no idea what it is: the
 * opening `---` becomes an <hr> and the `name:`/`description:` lines become a
 * heading full of raw YAML at the top of the page. The fields it carries
 * (name, description, license) duplicate data the row already has.
 *
 * Only a block starting on the very first line counts, so a `---` thematic
 * break further down the document is left alone.
 */
export function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/^﻿/, "");
  const match = normalized.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return markdown;
  return normalized.slice(match[0].length).replace(/^\s*\n/, "");
}

/** Default ceiling. READMEs run to hundreds of KB; this is roughly 1500-2500
 * words — a substantial page without turning a detail view into a book. */
export const DOC_MAX_CHARS = 14000;

export interface TruncationResult {
  markdown: string;
  truncated: boolean;
}

/**
 * Trim markdown to `maxChars` at a structural boundary, never mid-fence.
 *
 * Cutting a code fence in half would make every following paragraph render as
 * code, so if the kept text ends with an odd number of ``` fences we back up to
 * the start of the unterminated fence rather than closing it artificially.
 */
export function truncateMarkdown(input: string, maxChars: number = DOC_MAX_CHARS): TruncationResult {
  const markdown = input.replace(/\r\n/g, "\n").trim();
  if (markdown.length <= maxChars) return { markdown, truncated: false };

  let cut = markdown.slice(0, maxChars);

  // Prefer a blank-line (paragraph/section) boundary in the last 25%.
  const paraBreak = cut.lastIndexOf("\n\n");
  if (paraBreak > maxChars * 0.5) {
    cut = cut.slice(0, paraBreak);
  } else {
    const lineBreak = cut.lastIndexOf("\n");
    if (lineBreak > maxChars * 0.5) cut = cut.slice(0, lineBreak);
  }

  // An odd fence count means we are inside a code block: drop back to just
  // before the fence that opened it.
  const fences = cut.match(/^[ \t]*```/gm);
  if (fences && fences.length % 2 === 1) {
    const lastFence = cut.lastIndexOf("```");
    const lineStart = cut.lastIndexOf("\n", lastFence);
    cut = cut.slice(0, lineStart === -1 ? lastFence : lineStart);
  }

  return { markdown: cut.trimEnd(), truncated: true };
}

/**
 * Fingerprint of a skill's *rendered* doc content.
 *
 * Callers must hash the string they are about to store — post-stripFrontmatter,
 * post-truncateMarkdown — not the raw upstream file. An upstream edit confined to
 * YAML frontmatter, or one beyond DOC_MAX_CHARS that the truncation cuts away,
 * changes the raw bytes without changing a single character of the page. Stamping
 * a content-change date for those reintroduces exactly the meaningless-lastmod
 * noise skills.content_updated_at exists to remove.
 *
 * Caveat worth knowing before changing DOC_MAX_CHARS or stripFrontmatter: either
 * flips every row's hash at once, and the next refresher run would stamp all ~100
 * skills with the same content_updated_at — the shared-date signal Google already
 * learned to ignore on this site. Treat such a change as needing a deliberate
 * re-seed decision.
 */
export function contentHash(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

/** Which of the three doc-write branches a refresh falls into. Names match the
 * counters in scripts/refresh-skill-docs.mjs one-to-one. */
export type DocWriteBranch = "contentUnchanged" | "hashInitialized" | "contentChanged";

export interface DocWritePlan {
  branch: DocWriteBranch;
  /** Write doc_markdown and doc_content_hash. False means the stored copy already matches. */
  writeContent: boolean;
  /** Advance content_updated_at to the run time. */
  stampContentUpdatedAt: boolean;
}

/**
 * Decide what a refresh should write, given the freshly rendered content's hash
 * and the hash currently stored on the row.
 *
 * Note what is NOT decided here: doc_path, doc_source_url, doc_truncated and
 * doc_fetched_at are written on every branch, including the unchanged one.
 * fetchDoc resolves the doc path by a search order that can genuinely change
 * (repo-root README.md → a matched SKILL.md subdirectory) without changing a
 * character of rendered output, so gating the metadata would leave
 * doc_source_url pointing at a file that no longer exists.
 *
 * The null-stored-hash case is deliberately its own branch rather than being
 * folded into "changed". Every row starts there exactly once — at the migration,
 * and for each newly submitted skill — and there is no evidence the content
 * changed at that moment, only that nobody had hashed it before. Stamping
 * content_updated_at there would overwrite the seeded creation date with the run
 * date across the whole table at once, which is the shared-date bug again.
 */
export function planDocWrite(newHash: string, storedHash: string | null | undefined): DocWritePlan {
  if (storedHash === newHash) {
    return { branch: "contentUnchanged", writeContent: false, stampContentUpdatedAt: false };
  }
  if (!storedHash) {
    return { branch: "hashInitialized", writeContent: true, stampContentUpdatedAt: false };
  }
  return { branch: "contentChanged", writeContent: true, stampContentUpdatedAt: true };
}
