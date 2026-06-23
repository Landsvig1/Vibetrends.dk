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
- Make every migration **idempotent and reversible** — nothing tracks applied
  state, so re-runs and a future `db push` must be safe.
