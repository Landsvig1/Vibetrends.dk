// Seeds deterministic fixture rows for the e2e suite (a forum thread, a CLI
// entry) so tests/e2e/basic.spec.ts doesn't depend on whatever happens to
// exist in production. Run before `playwright test`; tests/e2e/global-teardown.mjs
// removes exactly the rows this run creates.
//
// Ids embed a per-run epoch (mirrors createProject/createSkill's p_/s_
// convention in src/lib/db.ts) so concurrent CI runs never collide on a
// fixed id, and staleness for the self-healing cleanup below is parsed
// straight from the id — no created_at column needed (agents has none).
//
// Run: node --env-file-if-exists=.env.local scripts/seed-e2e-fixtures.mjs
//
// Deliberately `--env-file-if-exists`, not AGENTS.md's `--env-file` (which
// hard-fails when the file is missing): this script also runs in CI, where
// there is no .env.local at all — DATABASE_URL comes directly from a GitHub
// Actions secret instead. `--env-file` would break the CI invocation outright.

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set in .env.local (or as a CI secret).');
  process.exit(1);
}

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const FIXTURES_MANIFEST = path.join(process.cwd(), '.e2e-fixtures.json');

function epochFromFixtureId(id) {
  const match = id.match(/^e2e-fixture-(?:thread|cli)-(\d+)$/);
  return match ? Number(match[1]) : null;
}

// `table` is always one of the two hardcoded literals passed below — never
// caller/environment-controlled — so interpolating it into the query is safe
// here, but do not extend this function to accept a caller-supplied table
// name without adding an allowlist check first.
async function cleanupStale(client, table) {
  const { rows } = await client.query(
    `select id from public.${table} where id like 'e2e-fixture-%'`
  );
  const staleIds = rows
    .map((r) => r.id)
    .filter((id) => {
      const epoch = epochFromFixtureId(id);
      return epoch !== null && Date.now() - epoch > STALE_THRESHOLD_MS;
    });
  if (staleIds.length > 0) {
    await client.query(`delete from public.${table} where id = any($1)`, [staleIds]);
    console.log(`Cleaned up ${staleIds.length} stale fixture row(s) from ${table}.`);
  }
}

async function run() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    await cleanupStale(client, 'forum_threads');
    await cleanupStale(client, 'agents');

    const now = Date.now();
    const threadId = `e2e-fixture-thread-${now}`;
    const cliId = `e2e-fixture-cli-${now}`;

    // Both inserts in one transaction: if the second insert fails, the first
    // is rolled back too, so a partial-success case never leaves a row
    // committed that the (never-written) manifest wouldn't know to clean up.
    try {
      await client.query('BEGIN');

      await client.query(
        `insert into public.forum_threads
           (id, title_da, title_en, author, category, content_da, content_en, upvotes, is_danish)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [
          threadId,
          'E2E fixture-tråd (auto-genereret)',
          'E2E fixture thread (auto-generated)',
          'e2e-fixture-bot',
          'General',
          'Denne tråd bruges af e2e-testsuiten og fjernes automatisk efter kørslen.',
          'This thread is used by the e2e test suite and is removed automatically after the run.',
          1,
        ]
      );

      // is_danish: true — the /cli and /mcp explorers default to the Dansk
      // tab, so the fixture must be Danish-flagged to be visible there.
      await client.query(
        `insert into public.agents
           (id, name, developer, category, description_da, description_en,
            install_command, system_prompt_da, system_prompt_en, upvotes, tags, is_danish)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`,
        [
          cliId,
          'E2E Fixture CLI',
          'e2e-fixture-bot',
          'CLI',
          'CLI-fixture brugt af e2e-testsuiten.',
          'CLI fixture used by the e2e test suite.',
          'npx e2e-fixture-cli --help',
          'You are the E2E Fixture CLI, a stand-in agent for automated testing.',
          'You are the E2E Fixture CLI, a stand-in agent for automated testing.',
          1,
          ['e2e-fixture'],
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    fs.writeFileSync(
      FIXTURES_MANIFEST,
      JSON.stringify({ forum_threads: [threadId], agents: [cliId] }, null, 2)
    );

    console.log(`Seeded fixtures: ${threadId}, ${cliId}`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Seeding e2e fixtures failed:', err);
  process.exit(1);
});
