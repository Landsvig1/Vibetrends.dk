---
title: "feat: add-vibe skill supports /skills catalog + authenticated inserts"
date: 2026-07-01
type: feat
depth: standard
deepened: 2026-07-01
---

**Target repo:** vibetrends-dk (app-side changes are repo-relative below). The
`add-vibe` skill itself lives outside this repo at
`~/.claude/skills/add-vibe/` and is edited in place — paths under that root are
written relative to `add-vibe/` in this plan, not the vibetrends-dk repo root.

---

## Summary

Extend the `add-vibe` skill so a single URL/repo input can land in either the
`/vibes` showcase or the `/skills` catalog, auto-detected from repo shape, with
multi-skill repos (e.g. `github.com/mikkelkrogsholm/skills`) importing every
skill as its own catalog entry in one pass. Insertion moves off the current
direct-to-Postgres / service-role-key write and onto the app's own
authenticated `POST /api/vibes` and `POST /api/skills` endpoints, under a
dedicated bot/curator account — closing an existing gap where bot-inserted
rows carry no `user_id` and skip the app's own validation.

---

## Problem Frame

`add-vibe` today only knows how to add `/vibes` projects, and it does so by
writing straight to `public.vibes` via `DATABASE_URL`/`pg`, with thumbnail
uploads via the Supabase **service-role key**. This was a deliberate choice at
the time (`docs/plans/2026-06-24-005-feat-add-vibe-pipeline-plan.md`) because
`POST /api/vibes` requires a live Supabase session cookie that a Node script
can't hold. Two things changed the calculus:

1. Mikkel Krogsholm's GitHub has several repos that are skill collections
   (`mikkelkrogsholm/skills`, `mikkelkrogsholm/ai-laegens-bord`) rather than
   showcase projects — the skill has no path for these today.
2. Bypassing the API means every bot-inserted row has no owning `user_id`,
   skips zod validation, and duplicates logic that already lives correctly in
   `src/lib/db.ts`. `createSkill` doesn't set `user_id` at all today — the
   only precedent for skill inserts is a raw SQL seed migration
   (`20260620020000_seed_skills_snapshot.sql`).

`docs/decisions/2026-06-19-agent-auth.md` already reasoned through
agent-facing write auth and chose scoped Personal Access Tokens
(`agent_tokens` table + `resolveAgentIdentity()`) for the MCP write surface —
but that's "decision only, implementation deferred," and neither the table
nor the resolver exist yet (confirmed via repo grep). Building that full PAT
system is out of scope here; this plan needs a narrower mechanism scoped to
one trusted bot account calling two existing REST routes, not a general
agent-token product.

**A deepening pass surfaced that the original mechanism, as first drafted,
would not actually work.** `createProject`/`createSkill` each build their own
cookie-based Supabase client internally and independently re-derive identity
from it — so a Bearer-only request (no cookie) would hit the database as
Postgres role `anon`, and `vibes`' RLS policy is `FOR INSERT TO authenticated`.
The insert fails outright, not just with a missing `user_id`. Separately,
`public.skills` has no INSERT policy and no `user_id` column at all under RLS
today — meaning `POST /api/skills` has likely never successfully inserted a
row for anyone, bot or human. Both are fixed below (KTD1, U1, U2) rather than
discovered mid-implementation.

---

## Requirements

- R1. Given a GitHub URL, the skill decides whether the target is a `/vibes`
  project or a `/skills` entry by inspecting repo shape, falling back to
  asking the user when detection is ambiguous.
- R2. A repo containing multiple `SKILL.md` files (one per subfolder) imports
  **all** of them in a single pass, each as its own `/skills` catalog row.
- R3. All inserts (both catalogs) go through the real, authenticated
  `POST /api/vibes` / `POST /api/skills` routes — not a direct Supabase
  service-role write — under a dedicated bot/curator account, so rows carry
  correct `user_id` ownership and pass the same zod validation a browser
  submission would.
- R4. Custom Playwright-screenshot thumbnails continue to work for `/vibes`
  entries after the switch to the authenticated API (today's
  `projectSchema`/`createProject` have no `imageUrl` field at all).
- R5. Each imported skill gets a best-effort `TOPIC_SLUGS` category, defaulting
  to `agent-workflows` when nothing else clearly fits, without blocking the
  import on a per-skill user prompt.
- R6. The bot/curator account's provisioning, auth mechanism, and credential
  rotation procedure are documented so the setup is reproducible, not just
  implemented once.
- R7. `public.skills` supports authenticated inserts with correct `user_id`
  ownership under RLS, matching the model `public.vibes` already has.

---

## Key Technical Decisions

**KTD1 — A distinctly-named bearer-auth helper, not an overload of
`getAuthUser()`, that also yields an authenticated client.**
`getAuthUser()` (`src/lib/supabase-server.ts`) is the shared identity seam for
13 route handlers today (agents, forum, vibes, skills — upvotes, deletes,
replies included), all cookie-only. Silently making it bearer-aware would mean
any future route that starts forwarding `Request` inherits bearer-bypass
semantics without anyone revisiting this plan's intent — flagged independently
by both the security and adversarial review passes. Instead, add a new,
separately-named function, `resolveBotRequestAuth(request: Request)`, used
**only** by the `/api/vibes` and `/api/skills` POST handlers. It:

1. Reads `Authorization: Bearer <token>`.
2. Builds a Supabase client via `createClient(url, anonKey, { global: { headers: { Authorization: \`Bearer ${token}\` } } })` — this makes PostgREST treat every
   subsequent query on *that client* as the `authenticated` role with
   `auth.uid()` resolving to the token's user, satisfying RLS without needing
   a cookie.
3. Calls `.auth.getUser()` on that same client to derive `{ id, username }`.
4. Returns `{ user, supabase }` — **both** the identity and the client that
   must perform the write, so the caller can thread the same authenticated
   client into `createProject`/`createSkill` instead of those functions
   silently building their own (cookie-based, therefore `anon`-role) client.

`getAuthUser()` itself is untouched. This is the fix for the RLS-rejection bug
found during deepening: identity resolution and the actual write must share
one client, not resolve auth twice through two different paths.

**KTD2 — `createProject`/`createSkill` accept an optional pre-resolved
identity + client.**
Both functions gain an optional parameter (e.g. `actingAs?: { user: { id, username }; supabase: SupabaseClient }`). When present, they use it directly instead of calling `createSupabaseServerClient()` /
re-deriving `.auth.getUser()` internally. When absent (every existing
browser/cookie caller), behavior is byte-for-byte unchanged. The two POST
routes call `getAuthUser()` first (cookie path, human submissions); if that's
null and an `Authorization` header is present, they call
`resolveBotRequestAuth(request)` and pass its result through as `actingAs`.

**KTD3 — Bot session obtained fresh per run, not cached; email/password
enablement is a project-wide decision, called out explicitly.**
The bot account authenticates via `signInWithPassword` at the start of each
script invocation rather than persisting a long-lived token — simpler, no
rotation/storage concerns for the token itself. **Correction from the
deepening pass:** enabling Supabase's email/password provider is a
**project-wide** setting — it is not scopable to a single account — so this
turns on password-based sign-in for every existing user, not just the bot.
That tradeoff must be made consciously (see Risks) rather than treated as a
routine checkbox; if the team judges that unacceptable, the fallback is a
non-interactive magic-link + `verifyOtp` flow for the bot account specifically,
which doesn't touch the project-wide provider setting. Decide which before
starting U3.

**KTD4 — Add `imageUrl` to the real vibes submission contract.**
`projectSchema`, `createProject`, and `POST /api/vibes` gain an optional
`imageUrl` field (validated as a URL). `vibes.image_url` already exists as a
column — this is a contract gap, not a schema gap. This also fixes the real
web submit form, which today can never set a custom thumbnail either.

**KTD5 — `public.skills` gets a migration adding `user_id` + an authenticated
INSERT policy, mirroring `public.vibes`.**
Confirmed via `supabase/migrations/20260618000000_init_schema.sql`: `skills`
has RLS enabled but only a public SELECT policy — no INSERT policy exists at
all, and no `user_id` column exists. `vibes` already has the target shape
(`"Allow authenticated insert to showcase" ... WITH CHECK (auth.uid() =
user_id)`); mirror it for `skills`. Without this migration, R3/R7 are not
achievable for the skills catalog at all — this was a hard blocker found
during deepening, not an optional hardening.

**KTD6 — Repo-shape detection via GitHub tree listing, not a heavyweight parser.**
Detection queries `gh api repos/<owner>/<repo>/git/trees/<default_branch>?recursive=1`
(the `gh` CLI is already relied on elsewhere in this session's workflow) and
checks for `SKILL.md` path(s). Zero or one `SKILL.md` at a shallow depth with
no other strong "this is an app" signal (e.g., `package.json` with a
`build`/`dev` script, a deployed-looking homepage) → skill. No `SKILL.md`
anywhere → project (today's behavior, unchanged). Genuinely mixed signals →
ask the user which catalog. This keeps detection a documented workflow step
in `SKILL.md`, not a new bespoke script, consistent with the skill's existing
thin-script philosophy (WebFetch + Playwright + one insert script).

**KTD7 — Category inference is best-effort, not a per-skill prompt.**
The agent reads each skill's `SKILL.md` frontmatter (name/description) —
already being read to extract metadata — and picks the best-fitting
`TOPIC_SLUGS` value, defaulting to `agent-workflows` when nothing else
clearly applies. Mirrors how the skill already infers project titles/
descriptions from fetched content without a blocking prompt per item.

**KTD8 — `createSkill` starts setting `user_id` and `source`.**
`user_id` is set from the resolved identity (the bot account, going forward
for all skill inserts, not just bot-imported ones — closing an existing gap
where no skill row has an owner; requires KTD5's migration to be RLS-legal).
`source` is set to the origin GitHub URL for bot-imported skills — the
`source` column already exists on `skills` (added by
`20260620010000_skills_snapshot_columns.sql`) and is already returned by
`mapSkill`, it's just never been *written* by `createSkill`; `skillSchema`
and `createSkill`'s signature both need the new field threaded through.

---

## Alternatives Considered

**A lighter shared-secret header instead of session-based bearer auth.** A
static shared secret checked only inside the two POST handlers, with
`user_id` hardcoded to a pre-created bot row, would avoid touching
`supabase-server.ts` entirely. Rejected: it still needs the identical
`skills` RLS/migration fix (KTD5) to let *any* authenticated-role insert
happen with correct ownership, and it introduces a second, parallel auth
mechanism (a raw secret compared in application code) alongside the app's
existing Supabase-session model, rather than reusing the RLS ownership model
every other mutation already relies on. The bearer approach in KTD1/KTD2 is
not meaningfully heavier once KTD5 is required either way, and keeps exactly
one identity model in the codebase.

---

## Scope Boundaries

**In scope:** repo-shape detection and multi-skill enumeration in the
`add-vibe` `SKILL.md` workflow; a shared bot-auth helper script; refactoring
`add-vibe.mjs` to POST through the authenticated API; a new sibling script
for skill inserts; the `imageUrl` contract extension on `POST /api/vibes`;
a distinctly-named bearer-auth helper (not `getAuthUser()`); the `skills`
RLS/`user_id` migration; bot account provisioning + rotation docs.

**Out of scope:**
- The full PAT system from `docs/decisions/2026-06-19-agent-auth.md`
  (`agent_tokens` table, issuance/revocation UI, per-user scoped tokens,
  general rate limiting infrastructure). This plan's bot account is a single
  hardcoded identity, not a general agent-token product.
- MCP write tools (`upvote_*`, `submit_*`, `reply_to_thread`) — still
  read-only per that ADR; unaffected by this plan.
- Any change to the `/skills` or `/vibes` **display/sort** UI — this plan is
  purely about the ingestion path.

### Deferred to Follow-Up Work

- Implementing the ADR's `agent_tokens` PAT system, if/when third parties
  need write access beyond this one bot account.
- A settings-UI or admin surface for managing the bot account's credentials
  (this plan documents the manual provisioning + rotation steps instead).
- General-purpose rate limiting on `POST /api/vibes`/`POST /api/skills`
  (see Risks — mitigated here with logging/monitoring guidance, not a full
  rate-limiter, to keep this plan scoped to the add-vibe skill).

---

## Implementation Units

### U1. `resolveBotRequestAuth()` — bearer identity + authenticated client

**Goal:** Give the two POST routes a way to resolve identity from a Bearer
token *and* obtain a Supabase client that will actually pass RLS as that
user — without touching the shared `getAuthUser()` cookie path used by 11
other route handlers.

**Requirements:** R3

**Dependencies:** none

**Files:**
- `src/lib/supabase-server.ts` (add `resolveBotRequestAuth(request)`,
  exported separately from `getAuthUser`)
- `src/app/api/vibes/route.ts`, `src/app/api/skills/route.ts` (POST handlers:
  try `getAuthUser()` first; if null and an `Authorization` header is
  present, call `resolveBotRequestAuth(request)` and use its result)
- `src/lib/__tests__/supabase-server.test.ts` (new)

**Approach:** `resolveBotRequestAuth` builds a client with the bearer token
forwarded as the `Authorization` header on all requests
(`createClient(url, anonKey, { global: { headers: { Authorization: 'Bearer ' + token } } })`), calls `.auth.getUser()` on *that* client, and returns
`{ user: { id, username } | null, supabase }`. `getAuthUser()` is not
modified in any way — a regression test asserts the routes it's used by
outside this plan (`vibes/[id]`, `vibes/[id]/upvote`, forum, agents) are
unaffected by this change.

**Patterns to follow:** the existing cookie-based `getAuthUser()` shape
(`src/lib/supabase-server.ts`) and the `skills` route test's pattern of
mocking `@/lib/supabase-server` (`src/app/api/skills/__tests__/route.test.ts`).

**Test scenarios:**
- Happy path: a valid Bearer token resolves `{ user, supabase }` with `user`
  matching the token's account.
- Happy path: the returned `supabase` client, when used to insert into
  `vibes`/`skills`, passes RLS (`auth.uid() = user_id`) — an integration
  test against a real/local Supabase instance, not a mock, since this is
  exactly the behavior that silently failed in the first draft of this plan.
- Edge case: malformed `Authorization` header (missing `Bearer ` prefix,
  empty token) resolves `user: null` without throwing.
- Error path: an expired or revoked token resolves `user: null`.
- Regression: `getAuthUser()`'s existing callers (`vibes/[id]/route.ts`,
  `vibes/[id]/upvote/route.ts`, forum and agents routes) are unmodified and
  their existing tests still pass unchanged — proves the bearer path is
  fully isolated to the two routes in scope.
- Integration: `POST /api/vibes` and `POST /api/skills`, called with only a
  Bearer header (no cookie), each successfully create a row owned by the
  token's user.

**Verification:** A Node script with only a bearer token (no browser
session) can successfully POST to both routes and the resulting rows show
the correct `user_id`; existing cookie-based tests for unrelated routes are
untouched and still green.

---

### U2. `public.skills` migration — `user_id` column + authenticated INSERT policy

**Goal:** Make authenticated inserts into `skills` actually legal under RLS,
mirroring the working `vibes` policy shape. Without this, `POST /api/skills`
cannot succeed for anyone, bot or human, today.

**Requirements:** R3, R7

**Dependencies:** none

**Files:**
- `supabase/migrations/<next-timestamp>_skills_user_id_and_insert_policy.sql`
  (new — idempotent per `AGENTS.md` convention: `add column if not exists`,
  `drop policy if exists` before `create policy`)

**Approach:** Mirror `vibes`' shape from
`supabase/migrations/20260618000000_init_schema.sql`:

```sql
alter table public.skills add column if not exists user_id uuid references auth.users(id);

drop policy if exists "Allow authenticated insert to skills" on public.skills;
create policy "Allow authenticated insert to skills"
  on public.skills for insert to authenticated
  with check (auth.uid() = user_id);
```

Apply via the project's documented one-off `node --env-file=.env.local
script.mjs` + `pg` + `DATABASE_URL` pattern (`AGENTS.md`), wrapped in
BEGIN/COMMIT, since `supabase db push` doesn't work in this project.

**Test scenarios:**
- Happy path: an authenticated insert with `user_id = auth.uid()` succeeds.
- Error path: an authenticated insert with a mismatched `user_id` is
  rejected by RLS (`WITH CHECK` failure).
- Error path: an unauthenticated (`anon`-role) insert is rejected.
- Regression: existing public SELECT access to `skills` is unaffected (no
  change to the read policy).

**Verification:** Run the migration against dev, then attempt an insert as
the bot account (once U1/U3 exist) and confirm it succeeds with the correct
`user_id`; confirm an anon-role insert attempt still fails.

---

### U3. `imageUrl` support on the real vibes submission contract

**Goal:** Close the gap where `POST /api/vibes` has no way to set a custom
thumbnail, so switching to the authenticated API doesn't regress custom
screenshots.

**Requirements:** R4

**Dependencies:** none

**Files:**
- `src/app/api/vibes/route.ts` (`projectSchema` gains optional `imageUrl`)
- `src/lib/db.ts` (`createProject` accepts and inserts `imageUrl`, falling
  back to today's hardcoded default only when omitted)
- `src/app/api/vibes/__tests__/route.test.ts` (new — no existing vibes route
  test file; follow the `skills` route test's schema-testing pattern)

**Approach:** `imageUrl` is optional and validated as a URL (mirroring
`demoUrl`'s existing `.url().optional().or(z.literal(""))` shape).
`createProject` passes it straight to the `image_url` column when present;
omitting it preserves today's default-thumbnail behavior for the real web
submit form, so this is additive, not a breaking change to existing callers.

**Test scenarios:**
- Happy path: submitting with a valid `imageUrl` stores that URL on the row.
- Happy path: omitting `imageUrl` still succeeds and falls back to the
  existing hardcoded default (regression guard for the human-facing submit
  form).
- Edge case: empty-string `imageUrl` is accepted the same way `demoUrl`
  handles empty string, or rejected — pick one and assert it explicitly.
- Error path: a non-URL `imageUrl` value is rejected by zod with a 400.

**Verification:** A submission with `imageUrl` set produces a `/vibes` row
whose `imageUrl` in the API response matches what was sent; the existing
human submit flow (no `imageUrl` in the payload) is unaffected.

---

### U4. Bot/curator account provisioning, documentation, and rotation procedure

**Goal:** Stand up one real Supabase account used exclusively for
skill-inserted rows across both catalogs, and document setup *and*
compromise/rotation response so it's reproducible and operable, not just
implemented once.

**Requirements:** R3, R6

**Dependencies:** U2 (needs the skills insert policy to exist to be useful)

**Files:**
- `add-vibe/SKILL.md` (new "Prerequisites" subsection documenting bot
  account setup and rotation)
- `.env.local.example` if one exists in vibetrends-dk (add
  `BOT_ACCOUNT_EMAIL` / `BOT_ACCOUNT_PASSWORD` placeholders) — verify the
  file exists before assuming its format

**Approach:** Create one Supabase Auth user for the bot (e.g.
`vibes-bot@vibetrends.dk`). Per KTD3, explicitly decide and document whether
this means enabling the project-wide email/password provider (with the
tradeoff stated plainly, not glossed over) or using a non-interactive
magic-link/OTP flow instead. Store credentials as
`BOT_ACCOUNT_EMAIL`/`BOT_ACCOUNT_PASSWORD` in `.env.local` (never committed,
consistent with how `SUPABASE_SERVICE_ROLE_KEY` is already handled per
`docs/plans/2026-06-24-005-feat-add-vibe-pipeline-plan.md`). Document, in
`SKILL.md`: (a) the one-time dashboard step, since it can't be scripted, (b)
a rotation procedure — generate a new password for the bot account, update
`.env.local`, no code changes needed since the password is read from env at
sign-in time, and (c) an incident-response note: if compromise is suspected,
first check recent `vibes`/`skills` rows for the bot's `user_id` to see what
was inserted, then rotate the password.

**Test scenarios:** Test expectation: none — this unit is account
provisioning and documentation, not application behavior. Verification is
operational: confirm the bot account can complete `signInWithPassword`
locally before wiring scripts to depend on it.

**Verification:** `signInWithPassword` against the bot account's credentials
returns a valid session from a throwaway Node REPL/script; the rotation
procedure in `SKILL.md` is followed once as a dry run and confirmed to work
without code changes.

---

### U5. Shared bot-auth helper + refactor `add-vibe.mjs` onto the authenticated API

**Goal:** Replace the direct pg/service-role write path for `/vibes` with an
authenticated `POST /api/vibes` call, while keeping the Playwright screenshot
+ storage-upload steps that already work.

**Requirements:** R3, R4

**Dependencies:** U1, U3, U4

**Files:**
- `add-vibe/scripts/bot-auth.mjs` (new — exports a `getBotAccessToken()`
  helper wrapping `signInWithPassword`)
- `add-vibe/scripts/add-vibe.mjs` (modify — swap the `pg` `INSERT` for a
  `fetch(...POST /api/vibes..., { headers: { Authorization: Bearer <token> } })`
  call; keep the existing Playwright screenshot + Supabase Storage upload
  steps, which remain service-role-key-based per the prior add-vibe plan)

**Approach:** `bot-auth.mjs` is a small, single-purpose module so
`add-skill.mjs` (U6) can reuse it without duplicating the sign-in call. The
uploaded thumbnail's public URL (already produced by the existing storage
upload step) is passed as `imageUrl` in the POST body, closing the loop with
U3.

**Test scenarios:** Test expectation: none automated — this is an admin CLI
script outside the vitest-covered `src/` tree, consistent with how
`add-vibe.mjs` and `setup-storage.mjs` are treated today. Verification is
manual per the Verification line below.

**Verification:** Re-run the exact `rentemester.dk` workflow used earlier
this session end-to-end through the new path and confirm the resulting
`/vibes` row has the correct `user_id` (bot account) and thumbnail.

---

### U6. New `add-skill.mjs` script + multi-skill repo enumeration

**Goal:** Give the skill a sibling insertion path for `/skills` entries,
handling both a single-skill repo and a multi-skill collection repo in one
pass.

**Requirements:** R1, R2, R5

**Dependencies:** U1, U2, U4

**Files:**
- `add-vibe/scripts/add-skill.mjs` (new — POSTs to `/api/skills` using the
  shared `bot-auth.mjs` helper from U5)

**Approach:** Accepts one skill's metadata per invocation (`--title`,
`--category`, `--description`, `--tags`, `--githubUrl`, mirroring
`skillSchema`'s fields plus the new `source` field from KTD8) and performs
one `POST /api/skills` call. The *enumeration* of multiple skills within one
repo (finding every `SKILL.md`, reading each one's frontmatter, picking a
category) is a workflow step documented in `SKILL.md` (KTD6/KTD7) that
invokes this script once per discovered skill — keeping the script itself
single-purpose rather than folding repo-walking logic into it. Because each
skill's sign-in is independent (KTD3: fresh session per invocation, not one
shared long-lived token across the whole batch), a token expiring mid-batch
on a very large repo cannot take out remaining skills — each invocation gets
its own fresh token.

**Test scenarios:** Test expectation: none automated (admin CLI script, same
rationale as U5). Verification is manual per the Verification line below.

**Verification:** Running the workflow against
`github.com/mikkelkrogsholm/skills` produces one `/skills` row per detected
`SKILL.md` (e.g. `jobindex-search` and its siblings), each with the correct
`source` URL and a `category` of `agent-workflows` unless a better fit was
evident.

---

### U7. Rewrite `add-vibe/SKILL.md` to document the branching workflow

**Goal:** Make the whole decision tree (detect → project path vs. skill
path → multi-skill enumeration → insert) legible to whoever (human or agent)
runs the skill next, including the new bot-account prerequisite and rotation
procedure.

**Requirements:** R1, R2, R6

**Dependencies:** U4, U5, U6

**Files:**
- `add-vibe/SKILL.md` (rewrite — supersedes the current 4-step
  project-only workflow)

**Approach:** Structure as: Prerequisites (existing three, plus bot account
setup + rotation from U4) → Step 1: detect repo shape (KTD6) → Step 2a:
project path (today's WebFetch/Playwright/`add-vibe.mjs` steps, updated for
the Bearer-auth call) → Step 2b: skill path (enumerate `SKILL.md` files,
infer category per KTD7, call `add-skill.mjs` once per skill) → Error
handling (ambiguous detection → ask user; partial multi-skill import failure
→ report which succeeded/failed rather than aborting the whole batch).

**Test scenarios:** Test expectation: none — documentation unit.

**Verification:** A fresh read-through of `SKILL.md` alone (no prior
conversation context) is enough to run either path correctly, including
recovering from a mid-batch failure in the multi-skill case.

---

## Risks & Dependencies

- **Email/password auth is a project-wide Supabase setting, not scoped to
  the bot account (KTD3/U4)** — enabling it opens password sign-in to every
  existing user, a security-relevant policy change (credential-stuffing/
  spray exposure with no MFA gate) that must be a conscious decision, not an
  operational footnote. Decide, before starting U4, whether to accept this
  tradeoff or use the non-interactive magic-link/OTP alternative instead.
- **No general rate limiting on the now-scriptable write path.** `POST
  /api/vibes`/`POST /api/skills` become reachable by a headless script
  authenticating fresh each run. If bot credentials leak, nothing currently
  throttles repeated inserts. Full rate-limiting infrastructure is deferred
  (Scope Boundaries) as disproportionate to this plan, but U4's
  incident-response note (check recent rows by the bot's `user_id`) is the
  minimum viable detection mechanism until something more automated exists.
- **Partial-failure handling in multi-skill imports (R2)** — importing 5
  skills from one repo where the 3rd fails (bad category, network blip)
  should not silently drop the other 4 or abort them; U7's error-handling
  section must specify per-skill reporting, not all-or-nothing.
- **Detection false positives (KTD6)** — a repo with a stray `SKILL.md` used
  for something unrelated could misroute to the skill path. The ask-the-user
  fallback is the safety valve; keep the "ask" bar low rather than tuning
  detection heuristics further.

---

## Sources & Research

- `docs/decisions/2026-06-19-agent-auth.md` — prior ADR on agent write auth;
  informs KTD1's narrower scope and the decision to name the new function
  distinctly from `getAuthUser()`.
- `docs/plans/2026-06-24-005-feat-add-vibe-pipeline-plan.md` — predecessor
  plan explaining why the current direct-write mechanism was chosen; several
  of its constraints (service-role key scoped to Storage only) carry forward.
- `docs/plans/2026-06-20-001-skills-topic-hub-plan.md` — establishes
  `TOPIC_SLUGS` (`src/lib/topics.ts`) as the canonical category taxonomy.
- `supabase/migrations/20260618000000_init_schema.sql` — source of truth for
  `vibes`' working RLS policy shape (mirrored for `skills` in U2) and
  confirmation that `skills` has no INSERT policy today.
- `supabase/migrations/20260620010000_skills_snapshot_columns.sql` —
  confirms `skills.source` already exists as a column, just unused by
  `createSkill`.
- `supabase/migrations/20260620020000_seed_skills_snapshot.sql` — precedent
  for the `source` attribution field used in KTD8.
- `src/app/api/skills/__tests__/route.test.ts` — test-writing pattern
  followed in U1/U3.

---

## Review Notes (2026-07-01 deepening pass)

Four reviewers (coherence, feasibility, security, adversarial) ran against
the first draft of this plan. Feasibility found the plan's central mechanism
would fail at the database layer as originally scoped (RLS rejection on
`vibes`, no INSERT policy at all on `skills`) — both fixed via KTD1/KTD2/KTD5
and new units U1/U2. Security and adversarial independently converged on the
same structural point (don't overload the shared `getAuthUser()` seam) —
addressed via the distinctly-named `resolveBotRequestAuth()` in KTD1.
Adversarial also corrected a factual claim in the original KTD (email/password
enablement scope) and flagged missing rate-limiting/rotation coverage — both
now addressed in Risks and U4. Coherence's one finding (U1 citing R6 without
addressing documentation) is resolved by this restructuring — R6 is now cited
only by U4/U7, which actually document the bot account.
