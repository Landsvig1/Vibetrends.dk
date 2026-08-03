// One-off backfill: repoint a skill's `github_url` from the repo root at the
// subdirectory the skill actually lives in.
//
// Why: 54 rows pointed at a bare repo URL, most of them into monorepos holding
// dozens of skills. candidateDocPaths only searches a named subdirectory, so a
// repo-root URL sends refresh-skill-docs.mjs down the slug-guessing path in
// fetchDoc() — and when that misses, the row gets the root README describing
// every sibling at once. Writing the real directory into the URL makes the row
// self-describing and removes the guess. Applied 2026-08-01: 42 rows rewritten,
// which took skills sharing byte-identical doc text from 29 to 4.
//
// Deliberately conservative — it only rewrites a row when the repo's tree gives
// an unambiguous answer. Anything it isn't sure about is listed under NEEDS
// REVIEW and left alone; nothing here is worth a wrong doc on the wrong page.
//
// Run:
//   GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local scripts/backfill-skill-subdir-urls.mjs
//   GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local scripts/backfill-skill-subdir-urls.mjs --apply
//
// Flags:
//   --apply      write the changes (default is a dry run that writes nothing)
//   --only <id>  restrict to a single skill (repeatable)
//
// Idempotent: a row whose URL already names a subdirectory is skipped, so
// re-running is a no-op and it stays useful for catching drift from later
// imports. Reversible without a backup — the repo root is the URL minus its
// `/tree/<ref>/...` tail.
//
// Afterwards, re-run the doc refresh so the new URLs take effect:
//   GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local scripts/refresh-skill-docs.mjs

import pg from 'pg';
import { Octokit } from '@octokit/rest';
import {
  parseGithubDocSource,
  skillSlugCandidates,
  pickDocPathFromTree,
} from '../src/lib/githubDocSource.ts';

const args = process.argv.slice(2);
function flagValues(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}
const onlyIds = flagValues('--only');
const apply = args.includes('--apply');

// --- preconditions ---------------------------------------------------------

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.error(
    [
      'ERROR: GITHUB_TOKEN is not set.',
      '',
      'Unauthenticated GitHub allows 60 requests/hour; this walks one tree per',
      'distinct repo plus a metadata call for each, so it would rate-limit',
      'partway through and leave the backfill half-applied.',
      '',
      'Run with a token, e.g.:',
      '  GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local scripts/backfill-skill-subdir-urls.mjs',
    ].join('\n')
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set (see .env.local).');
  process.exit(1);
}

// Same connection path as refresh-skill-docs.mjs: the direct host
// db.<ref>.supabase.co is IPv6-only and unreachable on some networks, so route
// through the IPv4 pooler. ssl is mandatory — without it node-postgres silently
// connects over plaintext TCP (see AGENTS.md).
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

const octokit = new Octokit({ auth: githubToken, userAgent: 'vibetrends-dk-skill-url-backfill' });

// The API caps github_url at 200 chars (skillSchema). Nothing stops a direct
// UPDATE writing a longer one, which would then fail validation the first time
// anyone edited the row through the site.
const MAX_URL_LENGTH = 200;

// --- repo inspection -------------------------------------------------------

/** One tree + metadata read per distinct repo, shared by every skill in it. */
const repoCache = new Map();

async function getRepo(owner, repo) {
  const key = `${owner}/${repo}`;
  if (repoCache.has(key)) return repoCache.get(key);

  const entry = { defaultBranch: null, skillPaths: [], error: null, truncated: false };
  try {
    const meta = await octokit.repos.get({ owner, repo });
    entry.defaultBranch = meta.data.default_branch;

    const tree = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: entry.defaultBranch,
      recursive: '1',
    });
    entry.skillPaths = (tree.data.tree ?? [])
      .filter((t) => t.type === 'blob' && typeof t.path === 'string' && t.path.endsWith('SKILL.md'))
      .map((t) => t.path)
      // Hidden dirs (.claude/, .agents/) hold a repo's own dev tooling, not the
      // skills it publishes — same filter the import path uses.
      .filter((p) => !p.split('/').some((seg) => seg.startsWith('.')));
    entry.truncated = Boolean(tree.data.truncated);
  } catch (err) {
    if (err.status === 403 || err.status === 429) {
      const reset = err.response?.headers?.['x-ratelimit-reset'];
      entry.error = `rate limited${reset ? ` (resets ${new Date(Number(reset) * 1000).toISOString()})` : ''}`;
    } else if (err.status === 404) {
      entry.error = 'repo not found (renamed, deleted or private)';
    } else {
      entry.error = err.message;
    }
  }

  // Only a successful read is cached. GitHub 5xx's on big trees are transient,
  // and caching one would condemn every other row in that repo on the same run.
  if (!entry.error) repoCache.set(key, entry);
  return entry;
}

/** Directory containing a SKILL.md path, or '' when it sits at the repo root. */
function dirOf(path) {
  const segments = path.split('/');
  return segments.slice(0, -1).join('/');
}

/**
 * Decide the subdirectory this row should point at.
 *
 * Returns { dir } to rewrite, { skip, reason } to leave alone deliberately, or
 * { review, reason } for a row a human should look at.
 */
function resolveDir(row, repoEntry) {
  const paths = repoEntry.skillPaths;

  if (paths.length === 0) {
    // README-only repo — the repo root is already the correct URL.
    return { skip: true, reason: 'no SKILL.md in repo; root README is the right doc' };
  }

  if (paths.includes('SKILL.md')) {
    // Single-skill repo with its manifest at the root: the bare URL is correct
    // and candidateDocPaths finds it directly.
    return { skip: true, reason: 'SKILL.md at repo root; URL already correct' };
  }

  // The strict matcher the detail page itself uses: exact directory-name match
  // against the id-derived slug, then the title-derived one.
  const candidates = skillSlugCandidates(row.id, row.title_en ?? row.title_da);
  const match = candidates.length ? pickDocPathFromTree(paths, candidates) : null;
  if (match) return { dir: dirOf(match) };

  // No slug match. If the repo publishes exactly one skill and exactly one row
  // points at it, the mapping is unambiguous regardless of naming.
  if (paths.length === 1 && row.repoRowCount === 1) {
    return { dir: dirOf(paths[0]), note: 'sole skill in repo (no slug match needed)' };
  }

  return {
    review: true,
    reason: `no directory matches ${JSON.stringify(candidates)} among ${paths.length} SKILL.md path(s)`,
  };
}

// --- main ------------------------------------------------------------------

async function run() {
  const client = new pg.Client(clientConfig);
  await client.connect();

  const stats = { total: 0, rewritten: 0, alreadySubpath: 0, skipped: 0, review: 0, failed: 0 };
  const review = [];

  try {
    const params = [];
    let sql = 'select id, title_da, title_en, github_url from public.skills where github_url is not null';
    if (onlyIds.length) {
      params.push(onlyIds);
      sql += ` and id = any($${params.length})`;
    }
    sql += ' order by id';

    const { rows } = await client.query(sql, params);
    stats.total = rows.length;

    // How many rows share each repo — decides whether a lone SKILL.md is an
    // unambiguous match or one of several rows competing for it.
    const rowsPerRepo = new Map();
    for (const row of rows) {
      const source = parseGithubDocSource(row.github_url);
      if (!source) continue;
      const key = `${source.owner}/${source.repo}`;
      rowsPerRepo.set(key, (rowsPerRepo.get(key) ?? 0) + 1);
    }

    console.log(`Checking ${rows.length} skill(s)${apply ? '' : ' (dry run — pass --apply to write)'}\n`);

    for (const row of rows) {
      const source = parseGithubDocSource(row.github_url);
      if (!source) {
        stats.failed++;
        console.warn(`! ${row.id}: could not parse github_url ${row.github_url}`);
        continue;
      }

      if (source.subpath) {
        stats.alreadySubpath++;
        continue;
      }

      const repoEntry = await getRepo(source.owner, source.repo);
      if (repoEntry.error) {
        stats.failed++;
        console.error(`! ${row.id}: ${source.owner}/${source.repo} — ${repoEntry.error}`);
        if (/rate limited/.test(repoEntry.error)) throw new Error(repoEntry.error);
        continue;
      }
      if (repoEntry.truncated) {
        console.warn(`  (tree for ${source.owner}/${source.repo} was truncated by GitHub; match may be incomplete)`);
      }

      row.repoRowCount = rowsPerRepo.get(`${source.owner}/${source.repo}`) ?? 1;
      const outcome = resolveDir(row, repoEntry);

      if (outcome.skip) {
        stats.skipped++;
        console.log(`- ${row.id}: ${outcome.reason}`);
        continue;
      }

      if (outcome.review) {
        stats.review++;
        review.push(`${row.id} (${row.title_da}) — ${source.owner}/${source.repo}: ${outcome.reason}`);
        console.warn(`? ${row.id}: ${outcome.reason}`);
        continue;
      }

      // The branch name, not a sha: the URL should keep tracking the branch the
      // way a hand-written GitHub link does.
      const newUrl = `https://github.com/${source.owner}/${source.repo}/tree/${repoEntry.defaultBranch}/${outcome.dir}`;

      if (newUrl.length > MAX_URL_LENGTH) {
        stats.review++;
        review.push(`${row.id} (${row.title_da}) — resolved URL is ${newUrl.length} chars, over the ${MAX_URL_LENGTH} limit: ${newUrl}`);
        console.warn(`? ${row.id}: resolved URL exceeds ${MAX_URL_LENGTH} chars, left alone`);
        continue;
      }

      stats.rewritten++;
      console.log(`✓ ${row.id}: ${row.github_url}\n           -> ${newUrl}${outcome.note ? `  [${outcome.note}]` : ''}`);

      if (!apply) continue;
      await client.query('BEGIN');
      try {
        // `source` (the attribution link) intentionally stays at the repo root.
        await client.query('update public.skills set github_url = $2 where id = $1', [row.id, newUrl]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.end();
  }

  console.log('\n--- summary ---');
  console.log(stats);
  if (review.length) {
    console.log('\nNEEDS REVIEW (left unchanged):');
    for (const r of review) console.log(`  ${r}`);
  }
  if (apply && stats.rewritten > 0) {
    console.log('\nNow re-run the doc refresh so the new URLs take effect:');
    console.log('  GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local scripts/refresh-skill-docs.mjs');
  }
  if (stats.failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
