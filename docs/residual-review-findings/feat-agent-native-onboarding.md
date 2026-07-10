# Residual Review Findings — feat/agent-native-onboarding

Source: 10-reviewer code review (correctness, testing, maintainability, project-standards,
security, api-contract, data-migration, adversarial, ce-agent-native-reviewer,
ce-learnings-researcher) run against `git diff origin/main...HEAD` (base `621f1c6`,
head at time of this record `e568e03`). Applied fixes are in commit `e568e03
fix(review): close rate-limit bypass and fix MCP/REST contract drift`. The items
below were deliberately **not** applied — recorded here so the reasoning survives
outside this session.

## P2 — Rate-limit RPC is griefable via a guessable per-IP key

**Reported by:** security, data-migration (independently, same root cause)

`check_and_increment_rate_limit` (`supabase/migrations/20260709010000_rate_limits.sql`)
is granted `EXECUTE` to `anon`/`authenticated` and accepts a caller-chosen `p_key`.
`hashIp()` (`src/lib/rate-limit.ts`) is plain `SHA-256(ip)` with no secret — anyone who
knows a target IP can compute the same key and call the RPC directly (via the public
anon key, same as any Supabase REST call) to increment that IP's bucket toward the
limit, causing spurious `429`s on `/api/agentauth` for that IP.

**Why not fixed now:** The correct remediation (HMAC the IP with a server-only secret
instead of plain SHA-256) requires provisioning a new secret in the Vercel environment.
Given this PR already introduces two new required setup steps (the `RATE_LIMIT` env
threshold implicitly and enabling `enable_anonymous_sign_ins` on the Supabase dashboard,
per KTD2 in the plan), adding a third required-but-easy-to-forget secret risks silently
breaking `/api/agentauth` in production if unset — a worse outcome than the narrow
griefing window this closes. The primary billing/abuse vector (unlimited token minting
via IP spoofing) is already fixed by the X-Forwarded-For correction in this PR; this
residual issue only lets an attacker who already knows a specific victim's IP lock that
IP out of token issuance for up to an hour, not mint unlimited tokens themselves.

**Suggested follow-up:** Add `RATE_LIMIT_HMAC_SECRET` to the Vercel project env, switch
`hashIp()` to `createHmac('sha256', secret).update(ip).digest('hex')`, and fail loudly
(not silently) at module load if the secret is unset in production.

## Deferred — MCP write-tool surface narrower than REST

**Reported by:** ce-agent-native-reviewer (unstructured finding, not a scored review finding)

Two gaps, both **out of the plan's confirmed scope** (`docs/plans/2026-07-09-003-feat-agent-native-onboarding-plan.md`
explicitly scoped exactly 6 MCP write tools):

1. No `create_thread`/`submit_thread` MCP tool — an agent using only MCP can reply to
   and upvote forum threads but cannot start one, even though `POST /api/forum` (REST)
   supports it and `createThread` already accepts `actingAs`.
2. No `submit_agent` MCP tool for registering a CLI tool or MCP server listing, even
   though `POST /api/agents` (REST, pre-existing) already accepts `actingAs`.

**Why not fixed now:** Not a bug in shipped code — these tools were never in scope.
Expanding MCP tool count is a legitimate follow-up, not a defect in this PR.

## Deferred — vibe/agent upvote still cookie-only (docs corrected, capability gap remains)

**Reported by:** ce-agent-native-reviewer

`src/app/api/vibes/[id]/upvote/route.ts` and `src/app/api/agents/[id]/upvote/route.ts`
still call `getAuthUser()` (cookie-only), not `resolveRequestIdentity()`. This PR's
discovery-file update (commit `e568e03`) corrected `llms.txt`/`ara.json` to stop
claiming bearer support on these two routes rather than extending the routes
themselves — the plan never scoped vibe/agent-upvote bearer support, and extending
it now would be scope creep this late in an already large diff.

**Suggested follow-up:** Extend both routes to `resolveRequestIdentity` + `actingAs`,
mirroring the four forum mutations already converted in this PR (`upvoteProject`/
`upvoteAgent` in `src/lib/db.ts` would need the same `resolveActor(actingAs)` swap).
Mechanical, low-risk, same pattern applied four times already.

## P2 — advisory, not applied

- **`src/app/api/mcp/route.ts`**: `WRITE_TOOLS` is a second hand-maintained list of
  tool names duplicating entries already in `TOOLS`. A `requiresAuth: true` field on
  each write tool's object literal, with `WRITE_TOOLS` derived via `.filter()`, would
  remove the duplication. Left as-is — cosmetic, no behavior risk either way.
- **No end-to-end integration test** exercises the full `POST /api/agentauth` → bearer
  token → `POST /api/vibes`/`/api/forum`/`/api/blog` → row visible flow without mocking
  `resolveRequestIdentity` at the boundary. The plan itself calls this "the single most
  important test in the plan." Every test in this PR mocks the identity-resolution
  boundary. A true integration test likely belongs in `tests/e2e/` (Playwright, against
  a seeded test Supabase project) rather than the `vitest` unit suite this PR extended —
  deferred as infrastructure work, not a quick fix.
