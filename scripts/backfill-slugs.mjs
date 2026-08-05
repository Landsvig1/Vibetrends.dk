// Fills `slug` on every skills / vibes / agents row, using the SAME slugify the
// application uses.
//
// This is step 2 of the four-step sequence documented at the top of
// supabase/migrations/20260805000000_catalog_slugs.sql. Run it after that
// migration and BEFORE 20260805001000_catalog_slugs_not_null.sql.
//
// Why a node script instead of SQL in the migration: the slug rules involve
// Danish folding (æ→ae, ø→oe, å→aa), diacritic stripping, length capping at a
// hyphen boundary, and reserved-word avoidance. Expressing that a second time
// as inline SQL would create two implementations that "must match exactly"
// with nothing enforcing it — and a drift between them means the backfilled
// URLs and the ones new submissions get would silently diverge. So the script
// imports src/lib/slug.ts directly, the same way scripts/refresh-skill-docs.mjs
// imports githubDocSource.ts. (A Postgres trigger was rejected for the same
// reason: it would make the duplication permanent.)
//
// Run:
//   node --env-file=.env.local scripts/backfill-slugs.mjs --dry-run
//   node --env-file=.env.local scripts/backfill-slugs.mjs
//
// Flags:
//   --dry-run       compute and report, write nothing
//   --table <name>  restrict to one of skills | vibes | agents (repeatable)
//
// Deterministic: rows are processed in `id` order and collisions take the next
// free `-2`, `-3`, … suffix, so a re-run over the same data produces
// byte-identical slugs. Rows that already have a slug are left alone (and their
// slug is reserved), which is what makes the script safe to re-run after new
// submissions have arrived.

import pg from 'pg';
import { nextFreeSlug } from '../src/lib/slug.ts';

const args = process.argv.slice(2);
function flagValues(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}
const dryRun = args.includes('--dry-run');

/** Which column each table derives its slug from. `agents` has no title column. */
const TABLES = {
  skills: 'title_en',
  vibes: 'title_en',
  agents: 'name',
};

const requestedTables = flagValues('--table');
for (const t of requestedTables) {
  if (!TABLES[t]) {
    console.error(`ERROR: unknown table "${t}". Expected one of: ${Object.keys(TABLES).join(', ')}`);
    process.exit(1);
  }
}
const tables = requestedTables.length ? requestedTables : Object.keys(TABLES);

// --- preconditions ---------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set (see .env.local).');
  process.exit(1);
}

// Mirrors scripts/refresh-skill-docs.mjs: the direct host db.<ref>.supabase.co
// is IPv6-only and unreachable on some networks, so route through the IPv4
// pooler. ssl is mandatory — without it node-postgres silently connects over
// plaintext TCP and sends the password in the clear (see AGENTS.md).
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

async function backfillTable(client, table) {
  const titleColumn = TABLES[table];
  const { rows } = await client.query(
    `select id, slug, ${titleColumn} as title from public.${table} order by id asc`
  );

  // Slugs already in the table are reserved, so a re-run cannot hand an
  // existing row's URL to a different row.
  const taken = new Set(rows.filter((r) => r.slug).map((r) => r.slug));
  const updates = [];

  for (const row of rows) {
    if (row.slug) continue;
    const slug = nextFreeSlug(row.title ?? '', taken);
    taken.add(slug);
    updates.push({ id: row.id, slug, title: row.title });
  }

  console.log(`\n${table}: ${rows.length} rows, ${updates.length} needing a slug`);
  for (const u of updates) console.log(`  ${u.id}  ${JSON.stringify(u.title)} -> ${u.slug}`);

  if (dryRun || updates.length === 0) return { table, rows: rows.length, written: 0 };

  await client.query('BEGIN');
  try {
    for (const u of updates) {
      await client.query(`update public.${table} set slug = $2 where id = $1`, [u.id, u.slug]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return { table, rows: rows.length, written: updates.length };
}

/**
 * Refuse to report success on a state the NOT NULL / unique migration would
 * reject. Checked against the database rather than against `updates`, because
 * the failure mode worth catching is one where the write did not do what the
 * in-memory plan said it did.
 */
async function assertConstraintReady(client, table) {
  const { rows: nulls } = await client.query(
    `select count(*)::int as n from public.${table} where slug is null`
  );
  const { rows: dupes } = await client.query(
    `select slug, count(*)::int as n from public.${table}
      where slug is not null group by slug having count(*) > 1`
  );

  const problems = [];
  if (nulls[0].n > 0) problems.push(`${nulls[0].n} row(s) still have a null slug`);
  if (dupes.length > 0) {
    problems.push(`duplicate slug(s): ${dupes.map((d) => `${d.slug} x${d.n}`).join(', ')}`);
  }
  if (problems.length) throw new Error(`${table}: ${problems.join('; ')}`);
}

async function run() {
  const client = new pg.Client(clientConfig);
  await client.connect();

  const results = [];
  try {
    for (const table of tables) {
      results.push(await backfillTable(client, table));
      if (!dryRun) await assertConstraintReady(client, table);
    }
  } finally {
    await client.end();
  }

  console.log('\n--- summary ---');
  for (const r of results) console.log(`  ${r.table}: ${r.written} written of ${r.rows} rows`);
  if (dryRun) {
    console.log('\n--dry-run: nothing was written.');
  } else {
    console.log('\nEvery row has a unique slug. Next step: deploy the Phase B code,');
    console.log('THEN apply supabase/migrations/20260805001000_catalog_slugs_not_null.sql.');
  }
}

run().catch((err) => {
  console.error('Slug backfill failed:', err);
  process.exit(1);
});
