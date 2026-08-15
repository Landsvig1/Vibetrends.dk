#!/usr/bin/env node
/**
 * Publish a merged weekly ranking: manifest on main -> skill_hot_rankings ->
 * cache revalidation.
 *
 * The other half of scripts/scan-hot-skills.mjs, and the exact counterpart of
 * scripts/review-queue.mjs for submissions. Merging the ranking PR runs this;
 * closing it unmerged runs nothing at all, because the manifest never lands on
 * main in that case.
 *
 * SECURITY: this is invoked from a `pull_request_target` workflow, which has
 * secrets. It therefore reads the manifest from the CHECKED-OUT BASE BRANCH
 * (main, post-merge), never from the PR head. The only thing taken from the PR
 * is the file path, and that is validated against a strict pattern below before
 * it is used. Do not change this to read the PR branch.
 *
 * Usage:
 *   node scripts/publish-hot-ranking.mjs --paths-from /tmp/paths.txt
 */

import { readFileSync } from 'node:fs';
import pg from 'pg';

// Module scope is deliberately free of side effects and process.exit calls, so
// parseManifest below can be imported and tested. Preconditions are checked in
// main(), which only runs when this file is executed directly.

/**
 * The only shape a ranking manifest may have. Anything else in the PR is not
 * this system's business and must not reach the database — same allowlist
 * discipline as scripts/review-queue.mjs.
 */
const MANIFEST_PATTERN = /^rankings\/skills-hot\/(\d{4}-W\d{2})\.md$/;

/**
 * Skill ids come out of a backticked cell in the manifest table. Constrained
 * rather than trusted: a manifest is a file in a pull request, and the row it
 * names is written into a public board.
 */
const SKILL_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

function clientConfig(databaseUrl) {
  const direct = databaseUrl.match(/@db\.([a-z0-9-]+)\.supabase\.co/);
  if (!direct) return { connectionString: databaseUrl, ssl: { rejectUnauthorized: false } };
  const url = new URL(databaseUrl);
  return {
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${direct[1]}`,
    password: url.password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  };
}

/**
 * Pull (position, skillId, score) out of the manifest's table rows.
 *
 * Parsing the human-editable table rather than a machine-readable sidecar is
 * deliberate: a reviewer is expected to be able to delete a row or reorder the
 * table in the PR, and what they see must be exactly what gets published. A
 * second source of truth would let the two disagree silently.
 */
export function parseManifest(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // | # | Skill | Skill ID | Score | Sources |  -> 7 cells with the empty edges
    if (cells.length < 6) continue;
    const position = Number(cells[1]);
    const idCell = cells[3];
    if (!Number.isInteger(position) || position < 1) continue;
    const id = idCell.replace(/^`|`$/g, '').trim();
    if (!SKILL_ID_PATTERN.test(id)) continue;
    const score = Number(cells[4]);
    rows.push({ position, skillId: id, score: Number.isFinite(score) ? score : null });
  }
  // Renumber from the table's order rather than trusting the printed numbers:
  // a reviewer who deletes row 3 leaves a gap, and a ranking with a hole in it
  // would violate the (week, position) unique index.
  return rows
    .sort((a, b) => a.position - b.position)
    .map((r, i) => ({ ...r, position: i + 1 }));
}

async function revalidate() {
  const secret = process.env.REVALIDATE_SECRET;
  const site = (process.env.SITE_URL || 'https://vibetrends.dk').replace(/\/$/, '');
  if (!secret) {
    // Loud, and fatal. A published ranking nobody can see is indistinguishable
    // from a broken scan: lists are cached at cacheLife('max') = 30 days, and
    // an Action cannot call revalidateTag itself.
    throw new Error('REVALIDATE_SECRET is not set — the ranking would not become visible');
  }
  const res = await fetch(`${site}/api/revalidate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: ['skills-list'] }),
  });
  if (!res.ok) throw new Error(`revalidate responded ${res.status}`);
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--paths-from');
  const pathsFrom = i >= 0 ? args[i + 1] : null;
  if (!pathsFrom) {
    console.error('ERROR: --paths-from <file> is required.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL must be set.');
    process.exit(1);
  }

  const paths = readFileSync(pathsFrom, 'utf8')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  const manifests = paths.filter((p) => MANIFEST_PATTERN.test(p));
  const rejected = paths.filter((p) => !MANIFEST_PATTERN.test(p));
  for (const p of rejected) console.log(`Ignoring non-manifest path: ${p}`);

  if (manifests.length === 0) {
    console.log('No ranking manifest in this PR. Nothing to publish.');
    return;
  }

  const client = new pg.Client(clientConfig(databaseUrl));
  await client.connect();
  try {
    for (const path of manifests) {
      const week = MANIFEST_PATTERN.exec(path)[1];
      const rows = parseManifest(readFileSync(path, 'utf8'));

      if (rows.length === 0) {
        console.log(`${week}: manifest has no usable rows — skipping.`);
        continue;
      }

      // One transaction per week: a half-written ranking would be an ordering
      // with holes, which the read path would render as a real board.
      await client.query('begin');
      try {
        // Replace rather than append. Re-running this (a re-merge, a retried
        // job) must converge on exactly what the manifest says.
        await client.query('delete from public.skill_hot_rankings where week = $1', [week]);

        // Skills deleted between proposal and merge would violate the foreign
        // key and abort the whole week. Drop them instead: the read path
        // already renders the remainder when a ranked row goes missing.
        const { rows: live } = await client.query(
          `select id from public.skills where id = any($1::text[]) and review_state = 'approved'`,
          [rows.map((r) => r.skillId)]
        );
        const liveIds = new Set(live.map((r) => r.id));
        const missing = rows.filter((r) => !liveIds.has(r.skillId));
        for (const m of missing) console.log(`${week}: skipping ${m.skillId} (not an approved skill)`);

        const keep = rows.filter((r) => liveIds.has(r.skillId));
        if (keep.length === 0) {
          console.log(`${week}: nothing left after dropping missing skills — publishing nothing.`);
          await client.query('rollback');
          continue;
        }

        const v = [];
        const p = [];
        keep.forEach((r, i) => {
          const b = i * 4;
          v.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
          p.push(week, r.skillId, i + 1, r.score);
        });
        await client.query(
          `insert into public.skill_hot_rankings (week, skill_id, position, score) values ${v.join(', ')}`,
          p
        );
        await client.query('commit');
        console.log(`${week}: published ${keep.length} entries.`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.end();
  }

  await revalidate();
  console.log('Revalidated skills-list.');
}

// Only run when executed directly, never on import.
if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
