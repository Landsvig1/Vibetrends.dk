import { parseGithubDocSource } from "./githubDocSource";

// Single source of truth for parsing a GitHub repo URL into owner/repo.
// Accepts an optional www. prefix, .git suffix, and trailing path segments
// (tree/branch, blob/file, issues/N) since those are common copy-paste
// sources users paste from their browser address bar.
//
// The parsing itself lives in ./githubDocSource, which additionally resolves
// the ref and subdirectory. That module has no imports so the refresh script
// can load it directly under Node's type stripping; this stays the name the
// rest of the app calls.
export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  const source = parseGithubDocSource(url);
  return source ? { owner: source.owner, repo: source.repo } : null;
}
