# ADR: Agent authentication for MCP write tools

- **Date:** 2026-06-19
- **Status:** Accepted (decision only — implementation deferred to a follow-up plan)
- **Context unit:** U9 of `docs/plans/2026-06-19-001-refactor-project-improvement-roadmap-plan.md`

## Problem

The MCP surface (`src/app/api/mcp/route.ts`) now speaks JSON-RPC 2.0 but exposes
**read tools only**. To reach agent-native parity, agents need the write actions
humans have: upvote, submit (skill/project/agent), and reply.

The blocker is authentication. Today every mutation in `src/lib/db.ts` resolves
identity via `createSupabaseServerClient().auth.getUser()` — i.e. the **Supabase
session cookie** set by the browser magic-link / OAuth flow. An MCP client is not
a browser and carries no such cookie. So a write tool would either act
unauthenticated (RLS rejects it — every insert policy is `WITH CHECK (auth.uid()
= user_id)`) or need a different identity channel.

We must choose that channel before building write tools.

## Options

### A. Scoped Personal Access Tokens (PATs) — **chosen**

A user generates a token in their account; the agent sends it as
`Authorization: Bearer <token>`. The MCP route hashes it, looks it up in a new
`agent_tokens` table (`token_hash`, `user_id`, `scopes`, `revoked_at`), and
resolves the acting user. Writes then run through a service-role client that
impersonates that `user_id`, or RLS is expressed against the resolved id.

- **Pros:** Simplest to ship; no third-party IdP; revocable; per-user
  attribution preserved (submissions stay tied to a real account); maps cleanly
  onto the existing `user_id` ownership model and RLS.
- **Cons:** We own token issuance, hashing, rotation, and a settings UI for it.
  Bearer tokens are long-lived secrets the user must guard.

### B. OAuth 2.1 / "Sign in with" provider

Full authorization-code + PKCE flow per the MCP auth spec.

- **Pros:** Spec-aligned, short-lived tokens, no long-lived secret on disk.
- **Cons:** Heavy for this surface — an OAuth server, consent screen, and token
  endpoints. Disproportionate to a directory whose writes are upvotes and posts.
  Reconsider if/when third parties build on the API at scale.

### C. Reuse the Supabase session (status quo)

Require the MCP client to forward a real session cookie/JWT.

- **Pros:** No new infrastructure.
- **Cons:** Agents can't run the interactive magic-link/OAuth flow; tokens are
  short-lived and not meant for headless reuse. Effectively unusable for agents.

## Decision

Adopt **Option A (scoped PATs)**. It matches the stakes of the write surface
(low-value, reversible community actions), preserves per-user attribution and the
existing RLS ownership model, and avoids standing up an OAuth server before there
is demand for one. Revisit Option B if external parties begin building durable
integrations on the API.

## Integration seam

`getAuthUser()` in `src/lib/supabase-server.ts` is already the single trusted
server-side identity resolver (cookie → `{ id, username }`). Extend identity
resolution so it *also* accepts a Bearer token:

- Add `resolveAgentIdentity(request)` that reads `Authorization: Bearer`, hashes
  the token, and looks up `agent_tokens` → `{ id, username }` or `null`.
- The MCP `tools/call` handler resolves identity via this path; existing
  cookie-based web mutations are unchanged.
- Write tools call the **same** `db.ts` mutation functions, so business logic and
  RLS stay in one place — only the identity source differs.

## Follow-up spike scope (separate plan)

1. Migration: `agent_tokens` table + RLS (owner-only select/insert/delete) + index on `token_hash`.
2. Token issue/revoke: a server action + minimal account-settings UI; show the raw token once.
3. `resolveAgentIdentity()` + wire into the MCP route.
4. MCP write tools: `upvote_project|thread|agent`, `submit_skill|project`, `reply_to_thread`, with spec-shaped `inputSchema` and JSON-RPC errors for auth failures (`-32600`/custom).
5. Rate limiting on write tools (per token).
6. Tests: token resolution (valid/expired/revoked/missing), one write round-trip per tool, RLS rejection when the token's user doesn't own the target on owner-scoped actions.

## Consequences

- MCP stays **read-only** until the follow-up lands; this is intentional and
  documented in `src/app/api/mcp/route.ts`.
- The client-side test-login backdoor in `AuthProvider` (flagged in the Phase 1
  test work) should be gated out of production **before** PATs ship, so the two
  identity paths don't interact.
