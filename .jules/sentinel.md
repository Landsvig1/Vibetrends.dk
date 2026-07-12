# Sentinel's Journal 🛡️

Your journal is NOT a log - only add entries for CRITICAL security learnings.

## 2026-07-10 - Proxy Endpoint Rate Limit Exhaustion and Denial of Service
**Vulnerability:** Unauthenticated server-side proxy endpoints (such as `/api/github-meta`) that relay requests to third-party APIs (like GitHub) without client-side rate limiting are susceptible to quota/token exhaustion and Abuse/Denial of Service. Attackers can spam these routes to drain pool limits or API keys, disabling core application features for all other users.
**Learning:** Proxy endpoints designed to keep third-party APIs out of browser CSP must have independent, server-side ingress control (such as IP-based rate limiting) to prevent cascading resource starvation or rate-limiting on upstream APIs.
**Prevention:** Always bound unauthenticated proxy endpoints to tight IP-based sliding-window rate limits using local database-backed atomic operations (e.g. `checkRateLimit`) to prevent bad actors from abusing server egress budgets.
