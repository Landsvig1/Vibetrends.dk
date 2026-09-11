/**
 * The one Postgres connection helper. Import this; do not re-derive it.
 *
 * Was copy-pasted into 12 scripts in 6 drifting variants, 11 of which sent the
 * percent-encoded password to the pooler and would fail auth with a misleading
 * error the first time the password contained an escapable character.
 *
 * ssl is mandatory: with no ssl option node-postgres silently connects over
 * plaintext and sends this password unencrypted (AGENTS.md).
 */
import pg from 'pg';

export async function connect() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');

  let config = { connectionString: raw, ssl: { rejectUnauthorized: false } };

  // Only rewrite the direct host form: db.<ref>.supabase.co is IPv6-only and
  // GitHub runners have no IPv6 egress. A URL that is already a pooler URL is
  // passed through, since deriving a ref from it yields `postgres.pooler`.
  const directHost = raw.match(/@db\.([a-z0-9-]+)\.supabase\.co/);
  if (directHost) {
    config = {
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${directHost[1]}`,
      password: decodeURIComponent(new URL(raw).password),
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    };
  }

  const client = new pg.Client(config);
  await client.connect();
  // ponytail: cheap assert on a path that carries a real password.
  if (!client.connection.stream.encrypted) throw new Error('connection is not encrypted');
  return client;
}
