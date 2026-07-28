// Applies a SQL migration file to the Supabase database.
//
// Supabase MCP and `supabase db push` do not work on this project (the MCP
// connector is authed to a different org, and the DB has no supabase_migrations
// tracking table), and psql isn't installed locally — see AGENTS.md. This is the
// documented one-off-node-script path, made reusable.
//
// Because nothing tracks applied state, migrations must be idempotent; this
// script does not check whether one has already run.
//
// Run:
//   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/<file>.sql

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node --env-file=.env.local scripts/apply-migration.mjs <path-to.sql>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set (see .env.local).');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), 'utf8');

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

try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log(`Applied ${file}`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error(`Migration failed, rolled back: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
