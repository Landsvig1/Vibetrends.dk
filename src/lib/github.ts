// Single source of truth for parsing a GitHub repo URL into owner/repo.
// Accepts an optional www. prefix, .git suffix, and trailing path segments
// (tree/branch, blob/file, issues/N) since those are common copy-paste
// sources users paste from their browser address bar.
export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/.*)?$/
  );
  if (!match) return null;
  const [, owner, repo] = match;
  return { owner, repo };
}
