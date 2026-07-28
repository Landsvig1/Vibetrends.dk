// Fetches each skill's SKILL.md (or README.md) from its source repo and stores
// the markdown on the `skills` row, so /skills/{id} has real content to render.
//
// Deliberately a standalone script, NOT a build-time or request-time fetch:
// 100+ GitHub calls per build is slow, rate-limit-fragile, and would make the
// site unbuildable whenever GitHub is down. The stored snapshot is refreshed on
// demand instead.
//
// Run:
//   GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local scripts/refresh-skill-docs.mjs
//
// Flags:
//   --only <id>   refresh a single skill (repeatable)
//   --limit <n>   stop after n skills
//   --dry-run     fetch and report, write nothing
//   --stale-only  skip rows refreshed within the last 7 days (default: all rows)
//
// Requires the columns added by
// supabase/migrations/20260728000000_skills_doc_snapshot.sql.

import pg from 'pg';
import { Octokit } from '@octokit/rest';
import {
  parseGithubDocSource,
  candidateDocPaths,
  docSourceUrl,
  truncateMarkdown,
  skillSlugCandidates,
  pickDocPathFromTree,
  stripFrontmatter,
  DOC_MAX_CHARS,
} from '../src/lib/githubDocSource.ts';

const args = process.argv.slice(2);
function flagValues(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}
const onlyIds = flagValues('--only');
const limit = Number(flagValues('--limit')[0] ?? 0) || null;
const dryRun = args.includes('--dry-run');
const staleOnly = args.includes('--stale-only');

// --- preconditions ---------------------------------------------------------

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.error(
    [
      'ERROR: GITHUB_TOKEN is not set.',
      '',
      'Unauthenticated GitHub allows 60 requests/hour; a full refresh needs one',
      'or more calls per skill (100+ rows), so it would rate-limit partway',
      'through and silently leave most pages empty.',
      '',
      'Run with a token, e.g.:',
      '  GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local scripts/refresh-skill-docs.mjs',
    ].join('\n')
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set (see .env.local).');
  process.exit(1);
}

// Mirrors scripts/migrate-blog-category-industry-to-agents.mjs: the direct host
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

const octokit = new Octokit({ auth: githubToken, userAgent: 'vibetrends-dk-skill-docs' });

// --- fetching --------------------------------------------------------------

function rateLimitError(err, where) {
  const reset = err.response?.headers?.['x-ratelimit-reset'];
  return new Error(
    `GitHub rate limit or access denied on ${where}` +
      (reset ? ` (resets ${new Date(Number(reset) * 1000).toISOString()})` : '')
  );
}

/**
 * Fetch one file, or null if it doesn't exist / isn't a non-empty file.
 *
 * Follows a single symlink hop: vercel/ai's root README.md is a symlink to
 * packages/ai/README.md, and treating that as "no README" would leave a
 * well-documented repo with a blank page. One hop only — enough for the
 * monorepo-hoists-a-package-README pattern, and it can't loop.
 */
async function fetchFile(source, path, followSymlink = true) {
  let data;
  try {
    const res = await octokit.repos.getContent({
      owner: source.owner,
      repo: source.repo,
      path,
      ...(source.ref ? { ref: source.ref } : {}),
    });
    data = res.data;
  } catch (err) {
    if (err.status === 404) return null;
    if (err.status === 403 || err.status === 429) {
      throw rateLimitError(err, `${source.owner}/${source.repo}/${path}`);
    }
    throw err;
  }

  if (Array.isArray(data)) return null;

  if (data.type === 'symlink' && followSymlink && typeof data.target === 'string') {
    const target = resolveSymlinkTarget(path, data.target);
    return target ? fetchFile(source, target, false) : null;
  }

  if (data.type !== 'file' || typeof data.content !== 'string') return null;
  const markdown = Buffer.from(data.content, 'base64').toString('utf8');
  // `path` is the resolved path, so a followed symlink attributes and links to
  // the file the content actually came from.
  return markdown.trim() ? { markdown, path } : null;
}

/** Resolve a symlink target relative to the link's own directory, rejecting
 * anything that escapes the repo. */
function resolveSymlinkTarget(linkPath, rawTarget) {
  // GitHub returns the target with the link file's trailing newline attached.
  const target = rawTarget.trim();
  if (!target || target.startsWith('/')) return null;
  const base = linkPath.split('/').slice(0, -1);
  const out = [...base];
  for (const seg of target.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  const resolved = out.join('/');
  return resolved.endsWith('.md') ? resolved : null;
}

// One recursive tree listing per repo, reused across every skill pointing at it
// (7 skills share obra/superpowers, 8 share coreyhaines31/marketingskills).
const treeCache = new Map();

async function repoSkillPaths(source) {
  const key = `${source.owner}/${source.repo}@${source.ref ?? 'HEAD'}`;
  if (treeCache.has(key)) return treeCache.get(key);

  let paths = [];
  try {
    const res = await octokit.git.getTree({
      owner: source.owner,
      repo: source.repo,
      tree_sha: source.ref ?? 'HEAD',
      recursive: '1',
    });
    paths = (res.data.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path);
    if (res.data.truncated) {
      console.warn(`  (tree for ${key} was truncated by GitHub; match may be incomplete)`);
    }
  } catch (err) {
    if (err.status === 403 || err.status === 429) throw rateLimitError(err, `tree ${key}`);
    if (err.status !== 404 && err.status !== 409) throw err; // 409 = empty repo
  }

  treeCache.set(key, paths);
  return paths;
}

/**
 * Resolve the best documentation file for a skill.
 *
 * Order:
 *   1. SKILL.md / README.md under the skill's own subdirectory, when the URL
 *      names one (`/tree/main/skill-creator`).
 *   2. SKILL.md at the repo root.
 *   3. For a repo-root URL: the SKILL.md whose directory matches this skill's
 *      slug. Many rows point at a monorepo of skills, where the root README is
 *      shared by every sibling and says nothing about this one specifically.
 *   4. README.md at the repo root.
 *
 * Returns null when none of those exist.
 */
async function fetchDoc(source, skill) {
  const rootOnly = !source.subpath;

  for (const path of candidateDocPaths(source)) {
    // Defer the repo-root README until after the tree match has had a chance.
    if (rootOnly && /^readme\.md$/i.test(path)) continue;
    const hit = await fetchFile(source, path);
    if (hit) return hit;
  }

  if (rootOnly) {
    const candidates = skillSlugCandidates(skill.id, skill.title_en);
    if (candidates.length) {
      const match = pickDocPathFromTree(await repoSkillPaths(source), candidates);
      if (match) {
        const hit = await fetchFile(source, match);
        if (hit) return hit;
      }
    }

    for (const path of ['README.md', 'readme.md']) {
      const hit = await fetchFile(source, path);
      if (hit) return hit;
    }
  }

  return null;
}

// --- main ------------------------------------------------------------------

async function run() {
  const client = new pg.Client(clientConfig);
  await client.connect();

  const stats = { total: 0, written: 0, noUrl: 0, unparseable: 0, notFound: 0, skipped: 0, failed: 0 };
  const notFound = [];

  try {
    const where = [];
    const params = [];
    if (onlyIds.length) {
      params.push(onlyIds);
      where.push(`id = any($${params.length})`);
    }
    if (staleOnly) {
      where.push(`(doc_fetched_at is null or doc_fetched_at < now() - interval '7 days')`);
    }
    const sql =
      `select id, title_en, github_url, doc_fetched_at from public.skills` +
      (where.length ? ` where ${where.join(' and ')}` : '') +
      ` order by id` +
      (limit ? ` limit ${Number(limit)}` : '');

    const { rows } = await client.query(sql, params);
    stats.total = rows.length;
    console.log(`Refreshing docs for ${rows.length} skill(s)${dryRun ? ' (dry run)' : ''}\n`);

    for (const row of rows) {
      if (!row.github_url) {
        // Not an error: github_url is optional and the page renders fine without
        // a doc. Clear any stale doc so a URL removal doesn't leave orphan text.
        stats.noUrl++;
        console.log(`- ${row.id}: no github_url, skipped`);
        if (!dryRun) await clearDoc(client, row.id);
        continue;
      }

      const source = parseGithubDocSource(row.github_url);
      if (!source) {
        stats.unparseable++;
        console.warn(`! ${row.id}: could not parse github_url ${row.github_url}`);
        continue;
      }

      let found;
      try {
        found = await fetchDoc(source, row);
      } catch (err) {
        stats.failed++;
        console.error(`! ${row.id}: ${err.message}`);
        if (/rate limit/i.test(err.message)) throw err; // no point continuing
        continue;
      }

      if (!found) {
        stats.notFound++;
        notFound.push(`${row.id} (${source.owner}/${source.repo}${source.subpath ? '/' + source.subpath : ''})`);
        console.log(`- ${row.id}: no SKILL.md or README.md found`);
        if (!dryRun) await clearDoc(client, row.id);
        continue;
      }

      // Strip frontmatter before truncating so the character budget is spent on
      // prose, not on YAML we are about to throw away.
      const { markdown, truncated } = truncateMarkdown(stripFrontmatter(found.markdown), DOC_MAX_CHARS);
      const url = docSourceUrl(source, found.path);
      stats.written++;
      console.log(
        `✓ ${row.id}: ${found.path} (${found.markdown.length} chars${truncated ? ` -> ${markdown.length}, truncated` : ''})`
      );

      if (dryRun) continue;
      await client.query('BEGIN');
      try {
        await client.query(
          `update public.skills
              set doc_markdown = $2,
                  doc_path = $3,
                  doc_source_url = $4,
                  doc_truncated = $5,
                  doc_fetched_at = now()
            where id = $1`,
          [row.id, markdown, found.path, url, truncated]
        );
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
  if (notFound.length) {
    console.log('\nRepos with no SKILL.md or README.md:');
    for (const n of notFound) console.log(`  ${n}`);
  }
  if (stats.failed > 0) process.exitCode = 1;
}

async function clearDoc(client, id) {
  await client.query(
    `update public.skills
        set doc_markdown = null, doc_path = null, doc_source_url = null,
            doc_truncated = false, doc_fetched_at = null
      where id = $1 and doc_markdown is not null`,
    [id]
  );
}

run().catch((err) => {
  console.error('Refresh failed:', err);
  process.exit(1);
});
