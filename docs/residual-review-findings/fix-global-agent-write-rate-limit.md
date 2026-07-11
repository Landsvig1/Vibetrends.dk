# Residual Review Findings — fix/global-agent-write-rate-limit

Source: `ce-code-review` (mode:agent), run 2026-07-10, 11 reviewers dispatched
(correctness, testing, maintainability, project-standards, security,
performance, api-contract, reliability, adversarial, ce-agent-native-reviewer,
ce-learnings-researcher) against the branch diff vs. `main` (base
`1c89d7a601029527b23b43238af97027b6626126`).

3 of 6 P0/P1 findings and all applicable P2 doc/contract findings were applied
directly (see commits `560cd13`, `30497d4`, `e0f67ab`, `eb64c0f` on this
branch). The items below were deliberately **not** auto-applied — each
requires either a production infrastructure decision (a new secret) or a
larger design change (DB-layer enforcement across every writable table) that
exceeds what an autonomous pipeline run should decide unsupervised.

## P0 — `check_and_increment_rate_limit` is callable directly by `anon`, letting anyone grief the shared write budget with zero authentication

**File:** `supabase/migrations/20260709010000_rate_limits.sql:66`
**Reviewer:** security, corroborated by learnings-researcher (citing a prior, already-deferred finding) and adversarial

Confirmed directly against the migration: `grant execute on function
public.check_and_increment_rate_limit(text, int, int) to anon,
authenticated;`. The function takes the rate-limit key, limit, and window as
plain caller-supplied parameters — there is no server-side secret involved.
Anyone with the public Supabase anon key (which is `NEXT_PUBLIC_*`, shipped
in the client bundle by design) can call this RPC directly via `supabase-js`
with `p_key: 'agentwrite:global'` and a low `p_limit`, repeatedly, to push
the shared counter past 200 — permanently denying writes to every legitimate
agent site-wide, for the remainder of each hourly window, indefinitely.

This is not a new gap this PR introduced — the RPC's `anon`/`authenticated`
grant and unsalted key scheme predate this PR and were already flagged and
deliberately deferred in a prior review round (see
`docs/residual-review-findings/feat-agent-native-onboarding.md`), scoped
there to griefing `/api/agentauth`'s per-IP *issuance* limit. This PR expands
the blast radius materially: `agentwrite:global` is a fixed, zero-reconnaissance
literal string (unlike a per-IP hash, which at least requires knowing a
target IP), and it is the entire point of the site-wide cost backstop this
session's work was built to add.

**Suggested fix:** HMAC every rate-limit key with a server-only secret before
calling `checkRateLimit` (e.g. `HMAC-SHA256(RATE_LIMIT_KEY_SECRET, 'agentwrite:global')`)
so a caller who can invoke the RPC directly cannot compute the same key the
app uses internally, even though they can still call the function itself.
Deferred here specifically because it requires provisioning a new secret in
Vercel's production environment — an action outside this pipeline's safe
autonomous scope (see global instructions: hard-to-reverse actions affecting
shared/production systems warrant explicit confirmation, not autonomous
action).

**Partial detection shipped in the meantime** (`supabase/migrations/20260710000000_rate_limit_rpc_audit.sql`,
hardened `20260711000000_rate_limit_rpc_audit_hardening.sql`): every call to
`check_and_increment_rate_limit` that doesn't match one of the three exact
`(key-shape, limit, window)` combinations this app's own code ever sends now
logs to `public.rate_limit_rpc_audit`. A logged row is proof of a
direct/foreign caller.

**What this catches:** blunt, unsophisticated direct calls — wrong limit,
malformed key shape, random probing. Verified live: a real `/api/agentauth`
call produced no audit row (matches an expected shape); a call with a
mismatched `p_limit` against `agentwrite:global`, and a call using a
36-character key that isn't real UUID shape, both logged correctly.

**What this does NOT catch — and this is the important caveat:** a caller
who already knows the app's exact constants (they're in this public
migration file) and sends a *real* shape — `agentwrite:global` with
`limit=200, window=3600` (the exact attack this whole finding is about), or
a real victim's `agentwrite:<uuid>` with `limit=20, window=3600` — is
indistinguishable from a legitimate app call and produces **no audit row at
all**. The realistic, damaging attacks are invisible to this mechanism; it
only catches the unrealistic, careless ones. Detection cannot close this gap
without an out-of-band secret — that's exactly what the HMAC fix above
provides and this audit log does not. Do not treat "detection shipped" as
license to deprioritize it.

## P0 — Rate limiting is enforced only in application code, not at the database layer

**File:** `src/app/api/agentauth/route.ts:99`
**Reviewer:** security

Any holder of a valid bearer token (from `/api/agentauth`, refreshed or not)
can skip this app's REST/MCP routes entirely and write directly to
Supabase's PostgREST API using the public anon key + their token. RLS on the
writable tables only checks `auth.uid() = user_id` — it has no awareness of
`checkAgentWriteAllowed` or either rate-limit tier. The entire two-tier
system this session built is a convention enforced by *this app's own route
handlers*, not something an agent is actually required to go through.

**Suggested fix:** Move enforcement (or a mirror of it) into the database
layer — either a `BEFORE INSERT` trigger on each writable table that calls
`check_and_increment_rate_limit` itself keyed on `auth.uid()`, or fold the
same call into each table's `WITH CHECK` RLS expression. Deferred because
this touches every writable table's policies — a larger, cross-cutting
change warranting its own plan rather than a review-fix patch.

## P2 — `rate_limits` table has no cleanup/expiry; grows one row per identity forever

**File:** `supabase/migrations/20260709010000_rate_limits.sql:12`
**Reviewer:** performance

`/api/agentauth` can mint unlimited distinct anonymous identities over time
(5/hour per IP, uncapped across distinct IPs), and each gets its own
`agentwrite:<user_id>` row that is never deleted, only reset in place on
window expiry. Needs a scheduled cleanup job (`pg_cron`, or a Vercel cron
hitting an admin endpoint) deleting rows past some retention window.

## P2 — `agents`/`vibes`/`skills` POST routes have zero test coverage for the new rate-limit guard

**Files:** `src/app/api/agents/route.ts`, `src/app/api/vibes/route.ts`, `src/app/api/skills/route.ts`
**Reviewer:** testing

Their existing test files only exercise Zod schema validation, not the POST
handler — unlike `blog`/`forum`/`mcp`, which all have dedicated 429/503/
cookie-bypass tests for the same guard. Mirror the pattern already used in
`src/app/api/blog/__tests__/route.test.ts`.

## P2 — New MCP JSON-RPC error code `-32003` is not discoverable via introspection

**File:** `src/app/api/mcp/route.ts:227`
**Reviewer:** api-contract, corroborated by ce-agent-native-reviewer

`tools/list` and the `initialize` response only return the tool catalog —
no error-code catalog exists anywhere in the MCP schema surface (this also
applies to the pre-existing `-32001`/`-32002` codes, not just the new one).
An MCP-only agent that never reads `ai.txt`/`llms.txt` has no way to learn
about the write-rate-limit ceiling before hitting it. Fix: add an error-code
map to the `tools/list` result, or at minimum name the numeric codes in the
agent-facing docs (currently only described as "a JSON-RPC error").

## Advisory — shared `agentwrite:global` counter is a coordinated-identity DoS lever, not just a cost ceiling

**File:** `src/lib/rate-limit.ts:79`
**Reviewer:** adversarial

Several identities each within their own 20/hour budget can collectively
exhaust the shared 200/hour global counter, denying writes to every other
agent for the remainder of the window. This is a known, accepted trade-off
of the current design (see the plan doc), but it is currently framed only as
a cost ceiling in code comments — worth an explicit note that it is also a
coordinated-abuse surface, should this ever need revisiting (e.g. reserving
budget per trust tier instead of one shared pool).
