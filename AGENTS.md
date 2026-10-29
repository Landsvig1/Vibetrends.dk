<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database migrations

- Supabase MCP and `supabase db push` do NOT work here: the MCP connector is
  authed to a different org, and the DB has no `supabase_migrations` tracking
  table (the schema was applied outside the CLI). `psql` isn't installed locally.
- Apply migrations with a one-off node script from the project root:
  `node --env-file=.env.local script.mjs`, using `pg` + `DATABASE_URL`
  (already in `.env.local`), each migration wrapped in BEGIN/COMMIT.
- **Always pass `ssl: { rejectUnauthorized: false }` in the `Client` config.**
  The server supports SSL but doesn't force it — `node-postgres` silently
  connects over plaintext TCP if you don't ask for TLS, meaning the DB
  password and every query travel unencrypted. Confirmed on 2026-07-07: a
  script with no `ssl` option connected fine but the underlying socket was
  not a `TLSSocket`. `rejectUnauthorized: true` fails with `SELF_SIGNED_CERT_IN_CHAIN`
  (Supabase's pooler presents a cert chain outside Node's default trust
  store) — `false` still negotiates real TLS (verified: `client.connection.stream.encrypted === true`),
  it just skips full chain validation. That's the right tradeoff for a local
  one-off script authenticating with a real DB password either way; it is
  not a substitute for care with the password itself.
- Make every migration **idempotent and reversible** — nothing tracks applied
  state, so re-runs and a future `db push` must be safe.

## If the direct host (`db.<ref>.supabase.co`) is unreachable

That hostname is IPv6-only. If your network/VPN doesn't have a working IPv6
route (`EHOSTUNREACH` on connect, confirmed 2026-07-07 — root cause was stale
`utun` tunnel interfaces hijacking the default IPv6 route), fall back to
Supabase's IPv4-reachable connection pooler instead of troubleshooting the
network:

```js
const url = new URL(process.env.DATABASE_URL);
const projectRef = url.hostname.split('.')[1]; // db.<ref>.supabase.co
const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com', // this project's pooler region
  port: 5432,
  user: `postgres.${projectRef}`,
  password: url.password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
```

The pooler hostname is shared, multi-tenant infrastructure (every Supabase
project in that region uses it) — routing to this project happens via the
`postgres.<project-ref>` username at auth time, same password as the direct
connection. It's not a weaker access path, just a different network route.


# PR quality bar (for Jules/Bolt/Sentinel)

This is a small community/showcase site — vibetrends.dk. Before proposing
a performance or refactor PR, check whether the change would actually earn
its keep at 10x current traffic. If the honest answer is "this solves a
problem the site doesn't have," don't open the PR.

Specifically:

- **`LanguageProvider`'s translation function (`t`) is not memoized.**
  Any `useCallback`/`React.memo` optimization that depends on `t` staying
  referentially stable across renders is silently broken today — the
  memo chain doesn't hold. Fix or account for that upstream instability
  before proposing another card/list memoization built on top of it, or
  the "optimization" won't actually do anything (confirmed on PR #73,
  2026-07-20: the memo depended on `t`, so the claimed re-render fix
  wasn't real).
- A "performance benchmark" test must make a real assertion (a timing
  threshold, or a render/call-count check that fails if the optimization
  regresses) — not a bare `console.log` of a computed speedup.
- Don't extract another list-item component into its own memoized
  `<XCard />` wrapper as a standing default. This exact pattern (extract
  inline JSX → `<Card />` → `React.memo` → stabilize handlers with
  `useCallback`) has now been applied to `SkillCard`, `ProjectCard`,
  `AgentCard`, `ThreadCard`, and again to blog/forum list cards — 6+
  times in under 2 weeks, with no shared wrapper ever built despite the
  repetition. If another list needs the same treatment, factor a shared
  memoized list-card wrapper once instead of hand-rolling a 7th copy of
  the same code.
- **Never commit `pnpm-lock.yaml`.** This repo uses npm
  (`package-lock.json`). A stray pnpm lockfile has been stripped from or
  caused rejection of at least five PRs (most recently #80, 2026-07-26).
  A PR whose diff contains `pnpm-lock.yaml` will be treated as bloat
  regardless of the code change it carries.
- **Before opening a PR, check the repo's open PRs for one touching the
  same file or component.** Same-day duplicate pairs (#30/#31, and
  Koalafilm's #33/#34) each cost a full review cycle to close as
  duplicates. If an open PR already covers the file, extend or wait —
  don't open a parallel PR.
- **Never copy the English description into `description_da`.** On `skills`,
  `vibes`, and `agents` that column is nullable and null means "not translated
  yet" — read paths fall back to `description_en` through
  `withEnglishFallback` in `src/lib/db.ts`. Writing the English text into the
  Danish column makes a real translation indistinguishable from a copy and
  permanently disables the fallback, which is the exact state migration
  `20260804000000_description_da_nullable.sql` had to clean up across 118 rows.
  The submit schemas take an optional `descriptionDa`; omit it rather than
  filling it with English.

# Security invariants

These rules are load-bearing. Don't relax one without the owner signing
off, and keep the TS and SQL copies in step when you change either.

- **Admin and curator identity is server-owned only.** `public.is_admin()` and
  `ADMIN_USER_IDS` / `CURATOR_BOT_USER_ID` in `src/lib/permissions.ts` key on
  `auth.users.id`. Never decide admin, review bypass or reserved-author rights
  from `user_metadata`, `app_metadata` set by a client, a username or an email.
- **The content guard trigger owns `upvotes`, author, `user_id` and
  `created_at`.** `guard_content_row` (migration
  `20261021100000_content_column_integrity.sql`) resets or keeps them on
  every PostgREST insert and update. Don't add a write path that sets them from
  caller input, and don't drop the trigger to make a feature work.
- **Pending rows are owner-only.** A row with `review_state = 'pending'` is
  readable by its owner (and the service role), never the public. New read paths go
  through `visibleOnly` in `src/lib/reviewGate.ts`; new SELECT policies keep
  the approved-or-own shape of `20261022110000_pending_rows_owner_only_select.sql`.
- **Approve compares against the reviewed manifest.** `scripts/review-queue.mjs`
  approves a pending row only if its live columns still match the manifest
  that was merged. Don't add an approve path that flips `review_state` without
  that compare, and add new reviewable columns to it.
- **URL fields are http(s) only.** Every user-supplied URL goes through
  `httpUrl` in `src/lib/schemas.ts`. Don't accept a URL field with a bare
  `z.string()` or `z.url()`.
- **Rate limits exist at both the app and the DB layer, and the DB one sits
  above the app one.** Write routes call `enforceWriteRateLimit` (MCP:
  `resolveWriteLimit`) from `src/lib/rate-limit.ts` for agents and humans
  alike; don't hand-roll a per-route check or skip it for a caller type. The
  DB insert ceiling (`limit_content_inserts`) catches direct PostgREST writes
  and must stay looser than every app tier, so app traffic never hits it.
