// Seeds skills.content_updated_at from each row's creation instant.
//
// The column records when a skill page's rendered content last changed, and is
// advanced from then on by scripts/refresh-skill-docs.mjs when the doc content
// hash moves. This script gives it a starting value.
//
// Why seed at all: leaving every row null until a genuine change is detected is
// strictly honest, but it is permanent rather than transitional — every future
// skill also starts with a null hash, so a stable corpus would emit zero sitemap
// lastmod forever. The creation instant encoded in the id is a real signal the
// codebase already trusts (/api/feed publishes it as publishedAt) and, unlike
// the build date this replaces, it is DISTINCT PER ROW.
//
// Legacy `seed_*` ids carry no epoch and are left null. They get a real date the
// first time their content actually changes.
//
// Idempotent: only rows where content_updated_at is null are written, so a
// re-run after the refresher has advanced some rows cannot walk them backwards.
//
// Run:
//   node --env-file=.env.local scripts/seed-content-updated-at.mjs [--dry-run]
//
// Requires the columns added by
// supabase/migrations/20260804040000_skills_content_updated_at.sql.

import pg from 'pg';
import { contentUpdatedAtSeed } from '../src/lib/epochId.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set (see .env.local).');
  process.exit(1);
}

// ssl is mandatory: without it node-postgres silently connects over plaintext
// TCP. The direct host db.<ref>.supabase.co is IPv6-only, so fall back to the
// IPv4 pooler (AGENTS.md).
let clientConfig = { connectionString: databaseUrl, ssl: { rejectUnauthorized: false } };
const directHostMatch = databaseUrl.match(/@db\.([a-z0-9-]+)\.supabase\.co/);
if (directHostMatch) {
  const projectRef = directHostMatch[1];
  const url = new URL(databaseUrl);
  clientConfig = {
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${projectRef}`,
    password: url.password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  };
  console.log(`Using IPv4 pooler connection path for project: ${projectRef}`);
}

const client = new pg.Client(clientConfig);
await client.connect();
if (client.connection.stream.encrypted !== true) {
  await client.end();
  console.error('ERROR: connection is not encrypted — refusing to send credentials in the clear.');
  process.exit(1);
}

const stats = { total: 0, seeded: 0, alreadySet: 0, noEpoch: 0 };

try {
  const { rows } = await client.query(
    'select id, content_updated_at from public.skills order by id'
  );
  stats.total = rows.length;
  console.log(`Seeding content_updated_at for ${rows.length} skill(s)${dryRun ? ' (dry run)' : ''}\n`);

  const updates = [];
  for (const row of rows) {
    if (row.content_updated_at !== null) {
      stats.alreadySet++;
      continue;
    }
    const seed = contentUpdatedAtSeed(row.id);
    if (!seed) {
      stats.noEpoch++;
      console.log(`- ${row.id}: no epoch in id, left null`);
      continue;
    }
    stats.seeded++;
    updates.push([row.id, seed]);
    console.log(`✓ ${row.id}: ${seed}`);
  }

  // A single transaction: a half-seeded table is harder to reason about than an
  // unseeded one, and the whole set is ~100 rows.
  if (!dryRun && updates.length) {
    await client.query('BEGIN');
    try {
      for (const [id, seed] of updates) {
        await client.query(
          `update public.skills
              set content_updated_at = $2
            where id = $1 and content_updated_at is null`,
          [id, seed]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  // Distinctness is the property that makes this worth doing — a shared date
  // across every URL is the exact bug the sitemap change is fixing. Assert it
  // rather than assuming, since a duplicate would mean two rows share an id
  // epoch and the sitemap would start emitting the old signal again.
  const { rows: check } = await client.query(
    `select count(*) filter (where content_updated_at is not null) as seeded,
            count(distinct content_updated_at)                     as distinct_dates
       from public.skills`
  );
  const { seeded, distinct_dates: distinctDates } = check[0];
  console.log('\n--- summary ---');
  console.log(stats);
  console.log(`rows with a date: ${seeded}, distinct dates: ${distinctDates}${dryRun ? ' (pre-run state)' : ''}`);
  if (!dryRun && Number(seeded) !== Number(distinctDates)) {
    console.error('ERROR: some rows share a content_updated_at — that is the shared-date bug this replaces.');
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
