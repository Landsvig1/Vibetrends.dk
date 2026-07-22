// Single source of truth for parsing a GitHub repo URL into owner/repo.
// Accepts an optional www. prefix, .git suffix, and trailing path segments
// (tree/branch, blob/file, issues/N) since those are common copy-paste
// sources users paste from their browser address bar.
export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  if (typeof url !== "string") return null;

  // Enforce overall URL length limit to prevent ReDoS and resource exhaustion
  if (url.length > 500) return null;

  // Strip query parameters and hash fragments first to prevent parameter injection
  const cleanUrl = url.split(/[?#]/)[0];

  const match = cleanUrl.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/.*)?$/
  );
  if (!match) return null;
  const [, owner, repo] = match;

  // Strict character whitelists for owner and repo segments:
  // GitHub usernames can only contain alphanumeric characters and hyphens.
  // GitHub repository names can contain alphanumeric characters, hyphens, underscores, and periods.
  const OWNER_REGEX = /^[a-zA-Z0-9-]+$/;
  const REPO_REGEX = /^[a-zA-Z0-9-_.]+$/;

  if (!OWNER_REGEX.test(owner) || !REPO_REGEX.test(repo)) {
    return null;
  }

  // Enforce length limits (GitHub usernames: 39 max, repo names: 100 max)
  if (owner.length > 39 || repo.length > 100) {
    return null;
  }

  return { owner, repo };
}
