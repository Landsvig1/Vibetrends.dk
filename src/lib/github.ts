// Single source of truth for parsing a GitHub repo URL into owner/repo.
// Accepts an optional www. prefix, .git suffix, and trailing path segments
// (tree/branch, blob/file, issues/N) since those are common copy-paste
// sources users paste from their browser address bar.
export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  // Strip any query parameters or hash fragments first to prevent parameter/fragment injection
  const cleanUrl = url.split(/[?#]/)[0];
  const match = cleanUrl.match(
    /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_.]+?)(?:\.git)?(?:\/.*)?$/
  );
  if (!match) return null;
  const [, owner, repo] = match;
  return { owner, repo };
}
