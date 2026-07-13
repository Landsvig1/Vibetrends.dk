// Removes exactly the fixture rows scripts/seed-e2e-fixtures.mjs created for
// this run (read from the manifest it writes), so fixture rows don't
// accumulate in the production database run over run. This is the fast
// path; the seed script's own stale-row cleanup (see its header comment) is
// the safety net for a run that crashes before this teardown executes.
//
// Plain .mjs, not .ts: Next.js's build typechecks every .ts file in the repo
// (tsconfig has no tests/ exclude), and `pg` ships no type declarations —
// a .ts version here broke `next build` outright.

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const FIXTURES_MANIFEST = path.join(process.cwd(), '.e2e-fixtures.json');

export default async function globalTeardown() {
  if (!fs.existsSync(FIXTURES_MANIFEST)) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('WARNING: DATABASE_URL not set — skipping e2e fixture teardown.');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(FIXTURES_MANIFEST, 'utf-8'));
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    if (manifest.forum_threads?.length) {
      await client.query('delete from public.forum_threads where id = any($1)', [manifest.forum_threads]);
    }
    if (manifest.agents?.length) {
      await client.query('delete from public.agents where id = any($1)', [manifest.agents]);
    }
    console.log('e2e fixture teardown complete.');
    // Only remove the manifest once both deletes above have actually
    // succeeded — if a query threw, the manifest (and its still-untracked
    // rows) must survive so the seed script's own stale-row cleanup can
    // still find and remove them later.
    fs.unlinkSync(FIXTURES_MANIFEST);
  } finally {
    await client.end();
  }
}
