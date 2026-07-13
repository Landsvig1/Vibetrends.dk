# Sentinel's Journal: Critical Security Learnings

## 2026-07-10 - Parameter Injection via Upstream Proxy URL Parsing
**Vulnerability:** The `parseGithubRepoUrl` function was susceptible to parameter injection because it extracted the owner and repository name segments from raw URLs without stripping query parameters (`?`) or hash fragments (`#`) first. Downstream, the server-side API `/api/github-meta` concatenated these segments directly into a fetch request to `https://api.github.com/repos/${owner}/${repo}`. An attacker could pass a crafted GitHub URL (e.g., `https://github.com/owner/repo?some-query`) to manipulate the upstream GitHub API request parameters.
**Learning:** Naive regex matching that is not explicitly anchored or fails to strip URL components (like query strings and fragments) can leak unvalidated segments into downstream HTTP requests. This leads to parameter injection where client input modifies the parameters, query, or path of an upstream request initiated by the server.
**Prevention:**
1. Always split or strip URL queries (`?`) and hash fragments (`#`) before performing regex parsing on URL paths.
2. Apply strict character whitelists and length limits to matched segments before trusting them in downstream API requests (e.g., restricting GitHub owners to `/^[a-zA-Z0-9-]+$/` and max 39 characters, and repos to `/^[a-zA-Z0-9-_.]+$/` and max 100 characters).

## 2026-07-10 - Proxy Endpoint Rate Limit Exhaustion and Denial of Service
**Vulnerability:** Unauthenticated server-side proxy endpoints (such as `/api/github-meta`) that relay requests to third-party APIs (like GitHub) without client-side rate limiting are susceptible to quota/token exhaustion and Abuse/Denial of Service. Attackers can spam these routes to drain pool limits or API keys, disabling core application features for all other users.
**Learning:** Proxy endpoints designed to keep third-party APIs out of browser CSP must have independent, server-side ingress control (such as IP-based rate limiting) to prevent cascading resource starvation or rate-limiting on upstream APIs.
**Prevention:** Always bound unauthenticated proxy endpoints to tight IP-based sliding-window rate limits using local database-backed atomic operations (e.g. `checkRateLimit`) to prevent bad actors from abusing server egress budgets.

## 2026-07-10 - CPU-Bound Pruning Logic in In-Memory Rate Limiting (Self-Inflicted DoS)
**Vulnerability:** In-memory sliding-window rate limiters can introduce severe CPU bottlenecks if the map of keys is pruned manually via full iteration `O(N)` on every request when the size exceeds a certain threshold. Under high load, this O(N) traversal blocks the Node.js single-threaded event loop, leading to a self-inflicted Denial of Service (DoS) even under normal or moderate traffic volumes.
**Learning:** Manual cache eviction and timing-based filtering are inefficient and prone to timing/CPU exhaustion. Additionally, in serverless environments (like Vercel), in-memory states are isolated and not shared across serverless instances, yielding weaker protection.
**Prevention:** Always bound unauthenticated public or proxy endpoints to tight IP-based sliding-window rate limits using local database-backed atomic operations (such as the project's existing `checkRateLimit` helper) to prevent bad actors from bypassing limits across serverless instances.
