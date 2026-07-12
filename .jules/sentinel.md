# Sentinel's Journal: Critical Security Learnings

## 2026-07-10 - Parameter Injection via Upstream Proxy URL Parsing
**Vulnerability:** The `parseGithubRepoUrl` function was susceptible to parameter injection because it extracted the owner and repository name segments from raw URLs without stripping query parameters (`?`) or hash fragments (`#`) first. Downstream, the server-side API `/api/github-meta` concatenated these segments directly into a fetch request to `https://api.github.com/repos/${owner}/${repo}`. An attacker could pass a crafted GitHub URL (e.g., `https://github.com/owner/repo?some-query`) to manipulate the upstream GitHub API request parameters.
**Learning:** Naive regex matching that is not explicitly anchored or fails to strip URL components (like query strings and fragments) can leak unvalidated segments into downstream HTTP requests. This leads to parameter injection where client input modifies the parameters, query, or path of an upstream request initiated by the server.
**Prevention:**
1. Always split or strip URL queries (`?`) and hash fragments (`#`) before performing regex parsing on URL paths.
2. Apply strict character whitelists and length limits to matched segments before trusting them in downstream API requests (e.g., restricting GitHub owners to `/^[a-zA-Z0-9-]+$/` and max 39 characters, and repos to `/^[a-zA-Z0-9-_.]+$/` and max 100 characters).
