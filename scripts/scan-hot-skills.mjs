#!/usr/bin/env node
/**
 * The weekly Hot scan: read the external sources, merge them into one ordering,
 * and write a manifest for a human to merge.
 *
 * It proposes. It never publishes. The manifest lands on a branch, a pull
 * request opens, and only merging it writes to the database (see
 * .github/workflows/resolve-hot-ranking.yml). That is the same shape as
 * submission-review.yml / submission-resolve.yml, and for the same reason:
 * PRODUCT.md bets the positioning on "curated, never scraped", and a git
 * history of every accepted ranking with a reviewer and a timestamp is that
 * claim made auditable.
 *
 * WHAT IT DOES NOT DO: insert catalog rows. Discovery and submission already
 * exist end to end (the Hermes feeder -> /api/agentauth -> pending ->
 * submission-review.yml). Ranked entries this catalog does not carry are listed
 * in the pull request body for that pipeline to pick up. One intake path.
 *
 * Usage:
 *   node --env-file=.env.local scripts/scan-hot-skills.mjs [--dry-run] [--out DIR]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import {
  mergeSources,
  matchToCatalog,
  buildBoard,
  normalizeRepo,
  entryKey,
} from '../src/lib/hotMerge.ts';
import { isoWeek } from '../src/lib/isoWeek.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const outDir = (() => {
  const i = args.indexOf('--out');
  return i >= 0 && args[i + 1] ? args[i + 1] : 'rankings/skills-hot';
})();

/**
 * Source weights. skills.sh leads because install counts are adoption, which is
 * the thing the board claims to measure; stars are interest, and Hacker News is
 * attention. Deliberately coarse: these are 3/2/1, not tuned constants, because
 * nothing yet justifies more precision than "one of these is the real signal".
 */
const WEIGHTS = { 'skills.sh': 3, 'github-stars': 2, 'hacker-news': 1 };

const HTTP_TIMEOUT_MS = 20_000;

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

// --- preconditions ---------------------------------------------------------


const siteUrl = (process.env.SITE_URL || 'https://vibetrends.dk').replace(/\/$/, '');
const hotScanSecret = process.env.HOT_SCAN_SECRET;
const githubToken = process.env.GITHUB_TOKEN;

// --- database --------------------------------------------------------------

// Mirrors scripts/refresh-skill-docs.mjs: the direct host db.<ref>.supabase.co
// is IPv6-only and unreachable on some networks, so route through the IPv4
// pooler. ssl is mandatory — without it node-postgres silently connects over
// plaintext TCP (see AGENTS.md).
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
 * The approved catalog, reduced to what matching needs.
 *
 * review_state = 'approved' is not optional: a pending submission is invisible
 * to every public read (src/lib/reviewGate.ts), so ranking one would put a row
 * on the board that visitors cannot open.
 */
async function loadCatalog(client) {
  const { rows } = await client.query(
    `select id, slug, title_en, github_url, source
       from public.skills
      where review_state = 'approved'`
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title_en,
    repo: normalizeRepo(r.github_url) ?? normalizeRepo(r.source),
  }));
}

/**
 * The most recent snapshot for a source, as entry_key -> value.
 *
 * An absent table reads as an absent baseline (undefined_table is 42P01). That
 * is what lets this run before its own migration is applied, and it is the
 * behaviour the migration's header comment promises. Any other error is real
 * and must not be swallowed.
 */
async function loadBaseline(client, source, week) {
  try {
    const { rows } = await client.query(
      `select entry_key, value
         from public.hot_source_snapshots
        where source = $1
          and week <> $2
          and captured_at = (
            select max(captured_at) from public.hot_source_snapshots
             where source = $1 and week <> $2
          )`,
      [source, week]
    );
    return new Map(rows.map((r) => [r.entry_key, Number(r.value)]));
  } catch (error) {
    if (error?.code === '42P01') {
      warn('  ! hot_source_snapshots does not exist yet — no baseline this run');
      return new Map();
    }
    throw error;
  }
}

async function saveSnapshot(client, source, week, entries) {
  if (entries.length === 0) return;
  const values = [];
  const params = [];
  entries.forEach((e, i) => {
    const b = i * 4;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
    params.push(week, source, e.key, Math.max(0, Math.round(e.value)));
  });
  await client.query(
    `insert into public.hot_source_snapshots (week, source, entry_key, value)
     values ${values.join(', ')}
     on conflict (week, source, entry_key) do update set value = excluded.value,
                                                          captured_at = now()`,
    params
  );
}

// --- sources ---------------------------------------------------------------

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

/**
 * skills.sh, via our own /api/internal/hot-sources.
 *
 * The indirection is not decoration: skills.sh authenticates with a Vercel OIDC
 * token that only a Vercel deployment can mint and that rotates twice a day, so
 * this job cannot call it directly. See the route's header comment.
 *
 * Velocity comes from our own weekly baseline. skills.sh's `change` is
 * day-over-day, which is the wrong window for a weekly board; it is used only
 * on the very first run, when no baseline exists, and that substitution is
 * reported rather than hidden.
 */
async function fetchSkillsSh(baseline) {
  if (!hotScanSecret) throw new Error('HOT_SCAN_SECRET is not set');
  const body = await getJson(`${siteUrl}/api/internal/hot-sources`, {
    Authorization: `Bearer ${hotScanSecret}`,
  });
  if (!Array.isArray(body?.entries)) throw new Error('hot-sources returned no entries array');

  const snapshot = [];
  const entries = [];
  let usedFallback = 0;

  for (const item of body.entries) {
    const key = entryKey({ slug: item.slug, repo: item.repo });
    snapshot.push({ key, value: item.installs });

    const previous = baseline.get(key);
    let value;
    if (previous === undefined) {
      // No baseline for this entry. Either the first run overall, or a skill
      // the leaderboard started carrying this week. Fall back to the daily
      // delta so it is not silently scored zero and buried.
      value = Math.max(0, item.change ?? 0);
      usedFallback++;
    } else {
      value = Math.max(0, item.installs - previous);
    }
    if (value > 0) entries.push({ slug: item.slug, repo: item.repo, value, url: item.url });
  }

  return { entries, snapshot, note: usedFallback ? `${usedFallback} entries had no weekly baseline` : null };
}

/**
 * GitHub star velocity over the catalog's own repos.
 *
 * Scoped to repos already in the catalog rather than to all of GitHub: this
 * source ranks what we carry, and discovering new repos is the submission
 * pipeline's job, not this one's.
 */
async function fetchGithubStars(catalog, baseline) {
  if (!githubToken) throw new Error('GITHUB_TOKEN is not set');

  const repos = [...new Set(catalog.map((c) => c.repo).filter(Boolean))];
  const snapshot = [];
  const stars = new Map();

  for (const repo of repos) {
    try {
      const data = await getJson(`https://api.github.com/repos/${repo}`, {
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'vibetrends-dk-hot-scan',
        'X-GitHub-Api-Version': '2022-11-28',
      });
      const count = Number(data?.stargazers_count);
      if (Number.isFinite(count)) {
        stars.set(repo, count);
        snapshot.push({ key: `repo:${repo}`, value: count });
      }
    } catch (error) {
      // One dead or renamed repo must not cost the whole source. Repos get
      // archived and moved constantly, and dropping the entire star signal
      // because of one 404 would be a far bigger distortion than losing one row.
      warn(`  ! stars for ${repo}: ${error.message}`);
    }
  }

  const entries = [];
  for (const row of catalog) {
    if (!row.repo) continue;
    const current = stars.get(row.repo);
    const previous = baseline.get(`repo:${row.repo}`);
    // No baseline means no velocity. Absolute star counts are NOT a fallback
    // here: they would rank the oldest repos first, every week, forever.
    if (current === undefined || previous === undefined) continue;
    const delta = current - previous;
    if (delta > 0) entries.push({ slug: row.slug, repo: row.repo, value: delta });
  }

  return {
    entries,
    snapshot,
    note: baseline.size === 0 ? 'no star baseline yet, so this source contributed nothing' : null,
  };
}

/**
 * Hacker News, via the public Algolia API. No auth, real scores.
 *
 * Matched by story title containing the skill's slug. That is a blunt
 * instrument, which is exactly why this source carries the lowest weight and
 * why a match needs the slug to be distinctive enough to appear verbatim.
 */
async function fetchHackerNews(catalog) {
  const since = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const body = await getJson(
    `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>${since}&hitsPerPage=200&query=${encodeURIComponent(
      'claude skill agent'
    )}`
  );
  const hits = Array.isArray(body?.hits) ? body.hits : [];

  const entries = [];
  for (const row of catalog) {
    const slug = row.slug?.toLowerCase();
    // Two characters would match half the front page. Require something that
    // could plausibly be a name.
    if (!slug || slug.length < 5) continue;
    let points = 0;
    for (const hit of hits) {
      const title = String(hit?.title ?? '').toLowerCase();
      if (title.includes(slug)) points += Number(hit?.points) || 0;
    }
    if (points > 0) entries.push({ slug: row.slug, repo: row.repo, value: points });
  }

  return { entries, snapshot: [], note: null };
}

// --- manifest --------------------------------------------------------------

export function renderManifest(week, board, report, notes) {
  const lines = [
    `# Hotteste globalt — ${week}`,
    '',
    '<!-- Generated by scripts/scan-hot-skills.mjs. Merging this PR publishes',
    '     the ranking; closing it discards the week. Edit the table to change',
    '     the board, or close the PR if the week is not worth publishing. -->',
    '',
    '| # | Skill | Skill ID | Score | Sources |',
    '| --: | --- | --- | --: | --- |',
  ];
  for (const row of board) {
    const sources = row.entry.contributions
      .map((c) => `${c.source} #${c.rank} (${c.value})`)
      .join(', ');
    lines.push(
      `| ${row.position} | ${row.catalog.title} | \`${row.catalog.id}\` | ${row.entry.score.toFixed(5)} | ${sources} |`
    );
  }
  lines.push('', '## Sources used', '');
  for (const u of report.used) {
    lines.push(`- **${u.source}** — weight ${u.weight.toFixed(3)}, ${u.count} entries`);
  }
  if (report.dropped.length) {
    lines.push('', '## Sources dropped', '');
    for (const d of report.dropped) lines.push(`- **${d.source}** — ${d.reason}`);
  }
  if (notes.length) {
    lines.push('', '## Notes', '');
    for (const n of notes) lines.push(`- ${n}`);
  }
  return lines.join('\n') + '\n';
}

function renderPrBody(week, board, report, notes, unmatched) {
  const lines = [
    `Weekly Hot ranking for **${week}**, proposed by \`scripts/scan-hot-skills.mjs\`.`,
    '',
    '**Merge** publishes this ranking and revalidates the caches. **Close** discards the week; the board simply expires.',
    '',
    '| # | Skill | Score | Sources |',
    '| --: | --- | --: | --- |',
  ];
  for (const row of board) {
    lines.push(
      `| ${row.position} | ${row.catalog.title} | ${row.entry.score.toFixed(5)} | ${row.entry.contributions
        .map((c) => `${c.source} #${c.rank}`)
        .join(', ')} |`
    );
  }
  lines.push('', `Sources used: ${report.used.map((u) => u.source).join(', ') || 'none'}.`);
  if (report.dropped.length) {
    lines.push('');
    lines.push('> **Sources dropped this week**');
    for (const d of report.dropped) lines.push(`> - \`${d.source}\`: ${d.reason}`);
    lines.push('>');
    lines.push('> Their weight was redistributed across the survivors. Check the ranking still looks defensible before merging.');
  }
  for (const n of notes) lines.push(`\n> Note: ${n}`);

  if (unmatched.length) {
    lines.push('', '## Ranked but not in the catalog', '');
    lines.push('These are hot upstream and vibetrends does not carry them. This PR does **not** add them: submission goes through the existing pipeline.');
    lines.push('');
    for (const u of unmatched.slice(0, 15)) {
      lines.push(`- \`${u.slug}\`${u.repo ? ` (${u.repo})` : ''}${u.url ? ` — ${u.url}` : ''}`);
    }
    if (unmatched.length > 15) lines.push(`- ...and ${unmatched.length - 15} more`);
  }
  return lines.join('\n') + '\n';
}

// --- main ------------------------------------------------------------------

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL must be set (see .env.local).');
    process.exit(1);
  }

  const week = isoWeek(new Date());
  log(`Hot scan for ${week}${dryRun ? ' (dry run)' : ''}`);

  const client = new pg.Client(clientConfig(databaseUrl));
  await client.connect();

  let outcome = { wrote: false };
  try {
    const catalog = await loadCatalog(client);
    log(`Catalog: ${catalog.length} approved skills`);

    const [skillsBaseline, starsBaseline] = await Promise.all([
      loadBaseline(client, 'skills.sh', week),
      loadBaseline(client, 'github-stars', week),
    ]);

    const notes = [];
    const snapshots = [];
    const results = [];

    // Each source is attempted independently. A failure drops that source and
    // is reported; it never aborts the run, and it never silently becomes an
    // empty-but-successful list (mergeSources treats those the same way, but
    // the reason differs and the PR body says which).
    for (const [name, run] of [
      ['skills.sh', () => fetchSkillsSh(skillsBaseline)],
      ['github-stars', () => fetchGithubStars(catalog, starsBaseline)],
      ['hacker-news', () => fetchHackerNews(catalog)],
    ]) {
      try {
        const { entries, snapshot, note } = await run();
        log(`  ${name}: ${entries.length} ranked entries`);
        if (note) notes.push(`${name}: ${note}`);
        if (snapshot.length) snapshots.push({ source: name, rows: snapshot });
        results.push({ source: name, weight: WEIGHTS[name], entries });
      } catch (error) {
        warn(`  ${name}: FAILED — ${error.message}`);
        results.push({ source: name, weight: WEIGHTS[name], entries: [], error: error.message });
      }
    }

    // Snapshots are written even when no ranking is proposed. Skipping them
    // would mean a week that produced no board also destroys the baseline for
    // the next one, turning one quiet week into two.
    if (!dryRun) {
      for (const s of snapshots) {
        try {
          await saveSnapshot(client, s.source, week, s.rows);
        } catch (error) {
          if (error?.code === '42P01') {
            warn('  ! cannot store a baseline: hot_source_snapshots does not exist yet');
            notes.push('no baseline was stored — apply the hot_source_snapshots migration');
            break;
          }
          throw error;
        }
      }
      log(`Snapshots written for ${snapshots.map((s) => s.source).join(', ') || 'nothing'}`);
    }

    const report = mergeSources(results);
    if (report.ranked.length === 0) {
      console.error('No source produced a ranking. Proposing nothing.');
      process.exitCode = 1;
      return;
    }

    const { matched, unmatched } = matchToCatalog(report.ranked, catalog);
    log(`Matched ${matched.length} to the catalog, ${unmatched.length} unmatched`);

    const { board, reason } = buildBoard(matched);
    if (!board) {
      log(`No board proposed: ${reason}`);
      return;
    }

    mkdirSync(outDir, { recursive: true });
    const manifestPath = join(outDir, `${week}.md`);
    const manifest = renderManifest(week, board, report, notes);
    const prBody = renderPrBody(week, board, report, notes, unmatched);

    if (dryRun) {
      log(`\n--- ${manifestPath} ---\n${manifest}`);
      return;
    }

    writeFileSync(manifestPath, manifest);
    writeFileSync(join(outDir, '.pr-body.md'), prBody);
    log(`Wrote ${manifestPath}`);
    outcome = { wrote: true, week, manifestPath };
  } finally {
    await client.end();
  }

  // Consumed by the workflow to decide whether there is anything to commit.
  if (process.env.GITHUB_OUTPUT && outcome.wrote) {
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `manifest=${outcome.manifestPath}\nweek=${outcome.week}\n`,
      { flag: 'a' }
    );
  }
}

// Only run when executed directly, so renderManifest can be imported in tests.
if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
