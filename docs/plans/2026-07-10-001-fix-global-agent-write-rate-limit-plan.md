# fix: Add global aggregate rate-limit backstop for agent writes

## Summary

Add a site-wide aggregate write-rate-limit for bearer-authenticated (agent)
writes, as a backstop on top of the existing per-identity cap. The
per-identity cap (`checkAgentWriteRateLimit`, 20 writes/hour/identity, shipped
earlier this session) bounds a single identity's abuse but not an attacker who
mints many identities — `POST /api/agentauth` issues a fresh anonymous
Supabase identity on every call (rate-limited to 5/hour **per IP**, with no
cap on distinct IPs), and each identity now renews indefinitely via its
`refresh_token`. Aggregate write throughput across the site currently has no
ceiling.

---

## Problem Frame

`checkAgentWriteRateLimit(userId)` in `src/lib/rate-limit.ts` scopes its
budget to a single `user_id`. This is the right control against one identity
spamming, but it does nothing to stop horizontal scaling: an attacker
rotating through N distinct IPs can mint 5×N identities per hour, each of
which keeps its own fresh 20/hour budget forever (identities never expire —
`refresh_token` lets them renew without re-provisioning). The total number of
identities, and therefore the total write throughput, has no upper bound
today.

This matters because every write is a real cost: a Supabase row insert/update
and a Vercel function invocation. Anonymous identities are also
MAU-billed on issuance. A single-identity cap alone does not bound worst-case
site-wide cost.

---

## Requirements

- R1: A new rate-limit check, independent of identity or IP, bounds the
  aggregate write volume across all bearer-authenticated (agent) writes
  site-wide.
- R2: The check applies at the same 8 write-surface call sites that already
  enforce `checkAgentWriteRateLimit` — both checks must pass for a write to
  proceed.
- R3: The check never applies to cookie-authenticated (human) writes,
  matching the existing per-identity check's scope.
- R4: Exceeding the global limit returns the same error shape the per-identity
  check already returns at each call site (429 for REST, a JSON-RPC error for
  MCP) — no new error contract.
- R5: Existing test suites continue to pass; new tests cover the added
  behavior.
- R6: Agent-facing docs (`public/ai.txt`, `public/llms.txt`,
  `src/app/agent-guide/page.tsx`) mention the global ceiling exists, briefly,
  alongside the already-documented per-identity limit.

---

## Key Technical Decisions

**KTD1 — Reuse `checkRateLimit`, one fixed key, no new abstraction.**
`checkRateLimit(key, limit, windowSeconds)` in `src/lib/rate-limit.ts` already
does atomic check-and-increment against the `check_and_increment_rate_limit`
Postgres RPC. The global check is the same primitive with a constant key
(`agentwrite:global`) instead of a per-identity key — no schema change, no new
table, no new abstraction. This mirrors `checkAgentWriteRateLimit`'s own
implementation exactly.

**KTD2 — Limit: 200 writes/hour, site-wide.**
Reasoning: the per-identity budget is 20/hour. 200/hour headroom
accommodates roughly 10 identities operating at full legitimate throughput
simultaneously — generous for the site's current traffic profile (a handful
of active agent integrations, not a marketplace) while still bounding
worst-case cost to a fixed, known number regardless of how many identities an
attacker mints. This is a starting number, not a scientifically derived one;
adjusting it later is a one-line change (no migration, no redeploy
architecture change).

**KTD3 — Check both caps at each call site, order doesn't matter for
correctness.**
Per call site, run the per-identity check and the global check when
`actingAs`/`botAuth` is present; either failing blocks the write with the
existing 429/JSON-RPC-error pattern already in place. Running both (rather
than short-circuiting on whichever is "more likely" to fail) keeps the two
checks independent and the code simple — two guard clauses, not a branching
tree.

**KTD4 — Same "bot-only" scope as the per-identity check.**
The global check only runs when `actingAs`/`botAuth` is present (i.e., only
for bearer-authenticated writes) — never for cookie-authenticated humans.
Same rationale as the existing per-identity check: human writes already pass
through full Supabase signup, a materially higher friction barrier, and are
out of this threat model.

---

## Scope Boundaries

**In scope:** the global write-rate-limit helper, wiring it into the 8
existing bot-write call sites, tests, and doc updates.

**Out of scope (see conversation context):**
- Supabase billing/spend alerts (dashboard-only, not something this repo can
  configure).
- Validating the Hermes/Neo redaction-and-refresh-token flow end-to-end —
  that's the user's own external agent, not testable from this repo.
- Any change to `/api/agentauth`'s per-IP issuance limit (5/hour) — untouched
  by this plan.
- Content moderation / review-before-publish for agent-authored content —
  a distinct risk (content quality, not cost) noted in prior conversation but
  not part of this fix.

### Deferred to Follow-Up Work

- Tuning the 200/hour constant based on real traffic data once agent write
  volume is observed in production.
- A moderation/review queue for agent-published content, if content-quality
  abuse (as opposed to cost abuse) becomes a real problem.

---

## Implementation Units

### U1. Add `checkGlobalAgentWriteRateLimit()` to the rate-limit module

**Goal:** Add the new site-wide check as a sibling to the existing
per-identity check, using the same underlying primitive.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**
- `src/lib/rate-limit.ts` (modify)
- `src/lib/rate-limit.test.ts` (modify)

**Approach:** Add a new exported async function
`checkGlobalAgentWriteRateLimit(): Promise<boolean>` that calls
`checkRateLimit('agentwrite:global', GLOBAL_AGENT_WRITE_LIMIT, GLOBAL_AGENT_WRITE_WINDOW_SECONDS)`
with `GLOBAL_AGENT_WRITE_LIMIT = 200` and
`GLOBAL_AGENT_WRITE_WINDOW_SECONDS = 60 * 60` as module-level constants,
directly beside the existing `AGENT_WRITE_LIMIT`/`AGENT_WRITE_WINDOW_SECONDS`
constants and `checkAgentWriteRateLimit`. Include a short doc comment
explaining the horizontal-scaling gap this closes (per KTD1/KTD2) — mirror
the existing comment style already on `checkAgentWriteRateLimit`.

**Patterns to follow:** `checkAgentWriteRateLimit` in
`src/lib/rate-limit.ts` (added earlier this session) — same shape, same file,
same test file pattern.

**Test scenarios:**
- Happy path: calling `checkGlobalAgentWriteRateLimit()` uses the fixed key
  `agentwrite:global` (assert via the mocked RPC call params, same pattern as
  the existing `checkAgentWriteRateLimit` describe block).
- Happy path: returns `true` when the underlying RPC reports within-limit.
- Edge case: returns `false` once the global budget is exhausted.
- The key is identical across repeated calls (no per-call variance) —
  confirms it is truly identity/IP-independent, distinguishing it from
  `checkAgentWriteRateLimit`'s per-user key.

**Verification:** `src/lib/rate-limit.test.ts` passes, including the new
describe block; `checkGlobalAgentWriteRateLimit` is exported and usable from
other modules.

---

### U2. Wire the global check into all 8 write surfaces

**Goal:** Every call site that currently guards a bot write with
`checkAgentWriteRateLimit` also guards it with
`checkGlobalAgentWriteRateLimit`, using the same "only when `actingAs`
present" scoping and the same error response already in place at that site.

**Requirements:** R2, R3, R4

**Dependencies:** U1

**Files:**
- `src/app/api/blog/route.ts` (modify)
- `src/app/api/agents/route.ts` (modify)
- `src/app/api/vibes/route.ts` (modify)
- `src/app/api/skills/route.ts` (modify)
- `src/app/api/forum/route.ts` (modify)
- `src/app/api/forum/[id]/upvote/route.ts` (modify)
- `src/app/api/forum/[id]/replies/route.ts` (modify)
- `src/app/api/forum/[id]/replies/[replyId]/upvote/route.ts` (modify)
- `src/app/api/mcp/route.ts` (modify)

**Approach:** At each of the 8 call sites, extend the existing
`if (actingAs && !(await checkAgentWriteRateLimit(actingAs.user.id))) { ...429... }`
guard (or the MCP route's equivalent JSON-RPC-error guard) to also check
`checkGlobalAgentWriteRateLimit()`. Two independent guard clauses (per KTD3)
rather than a combined boolean — keeps each check's failure attributable in
code, even though the client-visible error message can stay generic ("Too
many requests"). In the MCP route, this sits directly beside the existing
`RATE_LIMITED_ERROR` (`-32003`) usage added for the per-identity check — reuse
the same error code, since both are the same class of failure from the
caller's perspective.

**Patterns to follow:** The per-identity wiring added earlier this session at
each of these 8 sites — same call sites, same conditional shape, same error
responses. This unit is a mechanical extension of that pattern, not a new
one.

**Test scenarios:**
- Integration (REST, one representative route e.g. `/api/blog`): a
  bearer-authenticated write is rejected with 429 when the global check
  returns `false`, even if the per-identity check would have passed, and the
  underlying mutation (`createBlogPost`) is never called.
- Integration (MCP): a write tool call is rejected with a JSON-RPC error when
  the global check returns `false`, and the underlying `db.ts` mutation is
  never called.
- Integration (forum upvote, cheap/no-body route): same 429-and-no-mutation
  behavior as the body-bearing routes, confirming the guard clause pattern
  applies uniformly regardless of route shape.
- Regression: cookie-authenticated (non-bot) writes are unaffected — the
  global check is never invoked when `actingAs`/`botAuth` is absent.
- Regression: when both checks would pass, the write proceeds exactly as
  before (no behavior change to the happy path).

**Verification:** All 8 modified route files typecheck; the write path at
each site short-circuits to a 429/JSON-RPC-error when
`checkGlobalAgentWriteRateLimit` returns `false`, without invoking the
underlying `db.ts` mutation.

---

### U3. Update existing route test mocks and add coverage

**Goal:** Existing tests for the 3 route test files that already mock
`@/lib/rate-limit` (and any others touched by U2) continue to pass, and each
gets at least one test proving the new global-limit rejection path.

**Requirements:** R5

**Dependencies:** U2

**Files:**
- `src/app/api/blog/__tests__/route.test.ts` (modify)
- `src/app/api/mcp/__tests__/route.test.ts` (modify)
- `src/app/api/forum/__tests__/route.test.ts` (modify)
- Any of the remaining 5 route test files that mock `@/lib/rate-limit` after
  U2 lands (verify during implementation — `agents`, `vibes`, `skills` route
  tests may or may not currently exercise the bot-write path; only update
  where the bearer-auth path is actually tested)

**Approach:** Add `checkGlobalAgentWriteRateLimit: vi.fn().mockResolvedValue(true)`
to each `vi.mock("@/lib/rate-limit", ...)` factory alongside the existing
`checkAgentWriteRateLimit` mock — the same fix pattern already applied to
these three files earlier this session when the per-identity check was
introduced (each factory needed the new export added with a default
passing value, or every existing bearer-auth test in that file breaks).
Then add one rejection test per file (see Test scenarios in U2) using
`mockResolvedValueOnce(false)` on the global check specifically, keeping the
per-identity mock at its default `true` — this proves the two checks are
independently wired, not accidentally sharing one code path.

**Patterns to follow:** The `checkAgentWriteRateLimit` mock-and-test additions
made to these same three files earlier this session — identical mechanics,
new export name.

**Test scenarios:** (see U2's test scenarios — this unit is where they are
actually written)

**Verification:** `npx vitest run` passes across the full suite, including
the new global-limit rejection tests.

---

### U4. Update agent-facing docs

**Goal:** The docs that already describe the 20/hour per-identity limit also
briefly mention the 200/hour global ceiling, so an agent reading them
understands both constraints.

**Requirements:** R6

**Dependencies:** U1 (so the documented number matches the shipped constant)

**Files:**
- `public/ai.txt` (modify)
- `public/llms.txt` (modify)
- `src/app/agent-guide/page.tsx` (modify — both `en` and `da` branches)

**Approach:** Extend the existing per-identity rate-limit mentions (added
earlier this session) with one additional sentence per location noting the
site-wide 200/hour ceiling exists as a backstop. Keep it brief — this is a
footnote to the already-documented per-identity limit, not a new section.

**Patterns to follow:** The per-identity rate-limit doc additions made
earlier this session to these same four locations (two doc files, two
language branches in one page component).

**Test expectation:** none — documentation only, no behavioral change.

**Verification:** Each of the 4 doc locations mentions both the per-identity
(20/hour) and global (200/hour) limits.

---

## Verification Strategy

- `npx tsc --noEmit` clean across the repo.
- `npx vitest run` — full suite green, including new tests from U1 and U3.
- Manual read-through confirming all 8 write surfaces from the per-identity
  rollout also carry the global check (no site missed).
