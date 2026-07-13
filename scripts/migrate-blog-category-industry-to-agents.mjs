// One-off migration script to update blog post categories from 'Industry' to 'Agents'.
// Run: node --env-file=.env.local scripts/migrate-blog-category-industry-to-agents.mjs

import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set in env.');
  process.exit(1);
}

let clientConfig = {
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
};

// Check if the direct host is used, and if we should prepare a pooler fallback
// in case direct IPv6 connection fails.
const directHostMatch = databaseUrl.match(/@db\.([a-z0-9-]+)\.supabase\.co/);
if (directHostMatch) {
  const projectRef = directHostMatch[1];
  const url = new URL(databaseUrl);
  clientConfig = {
    host: 'aws-0-eu-west-1.pooler.supabase.com', // project's pooler region
    port: 5432,
    user: `postgres.${projectRef}`,
    password: url.password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  };
  console.log(`Using IPv4 pooler connection path for project: ${projectRef}`);
}

async function run() {
  const client = new pg.Client(clientConfig);
  await client.connect();

  try {
    await client.query('BEGIN');

    // Idempotent migration query
    const res = await client.query(
      `UPDATE public.blog_posts SET category = 'Agents' WHERE category = 'Industry'`
    );
    console.log(`Successfully migrated ${res.rowCount} blog posts from 'Industry' to 'Agents'.`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
