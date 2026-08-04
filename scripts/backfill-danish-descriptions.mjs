// Backfills `description_da` for catalog rows that have none.
//
// Every write path used to copy the English description into both language
// columns, so "Danish" was English for every row on the site. Migration
// 20260804000000_description_da_nullable.sql cleared those copies to null;
// this script fills them in with real Danish.
//
// Deliberately TWO passes with a human in the middle, not one automated run.
// The translations are the product here, and they ship to a Danish-native
// audience on a site whose whole differentiator is being Danish-first. The
// export/apply split makes them a reviewable artifact — a plain JSON file
// someone reads and approves — instead of an invisible side effect of a run.
//
// Usage:
//   1. node --env-file=.env.local scripts/backfill-danish-descriptions.mjs --export work.json
//   2. Fill in `descriptionDa` for each entry. Settle the register (De/du,
//      which technical terms stay English) on the first ten rows and get
//      sign-off before translating the rest.
//   3. Have a Danish speaker read the finished file.
//   4. node --env-file=.env.local scripts/backfill-danish-descriptions.mjs --apply work.json
//
// Flags:
//   --export <file>   write untranslated rows to <file>
//   --apply <file>    write translations from <file> back to the database
//   --dry-run         report what would happen, write nothing (both modes)
//
// The validation rules the apply pass enforces live in src/lib/danishBackfill.ts
// (unit-tested there); this file owns the connection and the file I/O only.

import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { BACKFILL_TABLES, validateBackfillEntries } from '../src/lib/danishBackfill.ts';

const args = process.argv.slice(2);
function flagValue(name) {
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) return args[i + 1];
  return null;
}
const exportPath = flagValue('--export');
const applyPath = flagValue('--apply');
const dryRun = args.includes('--dry-run');

// --- preconditions ---------------------------------------------------------

if (!exportPath && !applyPath) {
  console.error(
    [
      'ERROR: pass either --export <file> or --apply <file>.',
      '',
      '  --export work.json   write untranslated rows out for translation',
      '  --apply  work.json   write the finished translations back',
    ].join('\n')
  );
  process.exit(1);
}
if (exportPath && applyPath) {
  console.error('ERROR: --export and --apply are separate passes; run one at a time.');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set (see .env.local).');
  process.exit(1);
}

// Mirrors scripts/refresh-skill-docs.mjs: the direct host db.<ref>.supabase.co
// is IPv6-only and unreachable on some networks, so route through the IPv4
// pooler. ssl is mandatory — without it node-postgres silently connects over
// plaintext TCP and the DB password crosses the wire in the clear (AGENTS.md).
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

/** Every row the export pass selects — the same set the apply pass validates against. */
async function loadCandidates(client) {
  const byKey = new Map();
  const ordered = [];
  for (const t of BACKFILL_TABLES) {
    const { rows } = await client.query(
      `select id, ${t.titleColumn} as title, description_en, description_da
         from public.${t.name}
        where description_da is null${t.extraWhere}
        order by id`
    );
    for (const row of rows) {
      byKey.set(`${t.name}/${row.id}`, row);
      ordered.push({ table: t.name, row });
    }
  }
  return { byKey, ordered };
}

// --- export ----------------------------------------------------------------

async function runExport(client) {
  const { ordered } = await loadCandidates(client);

  const counts = {};
  const entries = ordered.map(({ table, row }) => {
    counts[table] = (counts[table] ?? 0) + 1;
    return {
      table,
      id: row.id,
      title: row.title,
      // Echoed back by the apply pass to prove the translation was paired with
      // the row it was written for. Do not edit these two fields.
      descriptionEn: row.description_en,
      descriptionDa: '',
    };
  });

  console.log('Untranslated rows by table:');
  for (const t of BACKFILL_TABLES) console.log(`  ${t.name}: ${counts[t.name] ?? 0}`);
  console.log(`  total: ${entries.length}`);

  if (dryRun) {
    console.log('\n(dry run: no file written)');
    return;
  }

  writeFileSync(exportPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${entries.length} entries to ${exportPath}`);
  console.log('Fill in each `descriptionDa`, leave `id`/`descriptionEn` untouched, then --apply.');
}

// --- apply -----------------------------------------------------------------

async function runApply(client) {
  let entries;
  try {
    entries = JSON.parse(readFileSync(applyPath, 'utf8'));
  } catch (err) {
    console.error(`ERROR: could not read ${applyPath}: ${err.message}`);
    process.exit(1);
  }
  if (!Array.isArray(entries)) {
    console.error('ERROR: the apply file must contain a JSON array.');
    process.exit(1);
  }

  const { byKey } = await loadCandidates(client);
  const { problems, writes } = validateBackfillEntries(entries, byKey);

  if (problems.length) {
    console.error(`Refusing to apply — ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nNothing was written. Fix the file and re-run.');
    process.exitCode = 1;
    return;
  }

  console.log(`${writes.length} row(s) ready to write, ${entries.length - writes.length} skipped.`);
  if (dryRun) {
    console.log('(dry run: nothing written)');
    return;
  }

  // One transaction: a partial apply would leave the file half-consumed, and
  // the already-translated guard would then reject the retry for those rows.
  await client.query('BEGIN');
  try {
    for (const w of writes) {
      await client.query(
        `update public.${w.table} set description_da = $2 where id = $1 and description_da is null`,
        [w.id, w.descriptionDa]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  console.log(`Wrote ${writes.length} Danish description(s).`);
}

// --- main ------------------------------------------------------------------

async function run() {
  const client = new pg.Client(clientConfig);
  await client.connect();
  try {
    if (exportPath) await runExport(client);
    else await runApply(client);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
