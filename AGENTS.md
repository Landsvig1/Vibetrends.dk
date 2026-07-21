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
