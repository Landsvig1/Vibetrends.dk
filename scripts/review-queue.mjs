#!/usr/bin/env node
/**
 * The submission review queue: list pending rows, render them as reviewable
 * manifests, and approve or reject them.
 *
 * Agent submissions land as `review_state = 'pending'` and are invisible to
 * every public read (src/lib/reviewGate.ts). This script is the other half:
 * .github/workflows/submission-review.yml turns each pending row into a pull
 * request, and merging or closing that PR calls back in here.
 *
 *   node scripts/review-queue.mjs list
 *   node scripts/review-queue.mjs manifest <table> <id>
 *   node scripts/review-queue.mjs approve  <table> <id> [...]
 *   node scripts/review-queue.mjs reject   <table> <id> [...]
 *
 * Connection follows AGENTS.md and the refresh-skill-docs precedent: `pg` over
 * DATABASE_URL with TLS, falling back to the IPv4 pooler because
 * db.<ref>.supabase.co is IPv6-only and GitHub runners have no IPv6 egress.
 * Connecting as the Postgres role bypasses RLS, which is the point — the
 * policies in 20260813000000_review_state.sql deliberately stop the *submitter*
 * approving anything, and the reviewer has to be able to.
 */

import { Client } from 'pg';
import { readFileSync } from 'node:fs';

/**
 * Per-table description of what a submission is.
 *
 * `fields` drives the manifest: it is an ordered list of [column, label] pairs,
 * and it exists because the manifest has to be judgeable from the PR diff
 * alone. An agent reviewing the PR sees the diff and nothing else — no database
 * access, no detail page (the row is unpublished, so it 404s). Anything omitted
 * here is invisible to the reviewer, so the lists are complete rather than
 * summarised.
 */
const TABLES = {
  skills: {
    label: 'Skill',
    hub: '/skills',
    listTag: 'skills-list',
    rowTag: (row) => [`skill-${row.id}`, `skill-slug-${row.slug}`],
    fields: [
      ['title_da', 'Titel'],
      ['category', 'Kategori'],
      ['vibe_coder', 'Indsender'],
      ['description_en', 'Beskrivelse'],
      ['description_da', 'Beskrivelse (dansk)'],
      ['tags', 'Tags'],
      ['github_url', 'GitHub'],
      ['source', 'Kilde'],
      ['slug', 'Slug'],
    ],
  },
  vibes: {
    label: 'Vibe-projekt',
    hub: '/vibes',
    listTag: 'projects-list',
    rowTag: (row) => [`project-${row.id}`, `project-slug-${row.slug}`],
    fields: [
      ['title_da', 'Titel'],
      ['author', 'Indsender'],
      ['description_en', 'Beskrivelse'],
      ['description_da', 'Beskrivelse (dansk)'],
      ['tools', 'Værktøjer'],
      ['prompts', 'Prompts'],
      ['demo_url', 'Demo'],
      ['github_url', 'GitHub'],
      ['image_url', 'Billede'],
      ['slug', 'Slug'],
    ],
  },
  agents: {
    label: 'CLI / MCP-server',
    hub: '/cli',
    listTag: 'agents-list',
    rowTag: (row) => [`agent-${row.id}`, `agent-slug-${row.slug}`],
    fields: [
      ['name', 'Navn'],
      ['category', 'Kategori'],
      ['developer', 'Udvikler'],
      ['description_en', 'Beskrivelse'],
      ['description_da', 'Beskrivelse (dansk)'],
      ['install_command', 'Installation'],
      ['system_prompt_en', 'System-prompt'],
      ['tags', 'Tags'],
      ['source_url', 'Kilde'],
      ['slug', 'Slug'],
    ],
  },
  blog_posts: {
    label: 'Blogindlæg',
    hub: '/blog',
    listTag: 'blog-posts',
    // A first approved post un-empties the hub: nav link, sitemap entry,
    // robots index. Same tag createBlogPost drops on a direct publish.
    extraTags: ['hub-emptiness'],
    rowTag: (row) => [`blog-post-${row.id}`],
    fields: [
      ['title_da', 'Titel'],
      ['category', 'Kategori'],
      ['author', 'Forfatter'],
      ['excerpt_da', 'Resumé'],
      ['read_time', 'Læsetid'],
      ['published_at', 'Udgivelsesdato'],
      ['image_url', 'Billede'],
      ['content_da', 'Indhold'],
    ],
  },
  forum_threads: {
    label: 'Forumtråd',
    hub: '/forum',
    listTag: 'threads-list',
    extraTags: ['hub-emptiness'],
    rowTag: (row) => [`thread-${row.id}`],
    fields: [
      ['title_da', 'Titel'],
      ['category', 'Kategori'],
      ['author', 'Forfatter'],
      ['content_da', 'Indhold'],
    ],
  },
  forum_replies: {
    label: 'Forumsvar',
    hub: '/forum',
    listTag: 'threads-list',
    rowTag: (row) => [`thread-${row.thread_id}`],
    fields: [
      ['thread_id', 'Tråd'],
      ['author', 'Forfatter'],
      ['content_da', 'Indhold'],
    ],
  },
};

/** Table names are interpolated into SQL, so they must come from this map and
 *  never from an argument directly. */
function assertTable(table) {
  if (!Object.hasOwn(TABLES, table)) {
    throw new Error(`Unknown table: ${table}. Expected one of ${Object.keys(TABLES).join(', ')}`);
  }
  return TABLES[table];
}

async function connect() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');

  // Mirrors scripts/refresh-skill-docs.mjs exactly, including the conditional.
  // The rewrite is applied ONLY when DATABASE_URL is the direct host form,
  // because db.<ref>.supabase.co is IPv6-only and GitHub runners have no IPv6
  // egress. If the secret is already a pooler URL, it is passed straight
  // through: deriving a project ref from it unconditionally would produce
  // `postgres.pooler` as the username and fail authentication with a
  // thoroughly misleading error.
  //
  // ssl is mandatory either way. rejectUnauthorized:false still negotiates
  // real TLS — it only skips chain validation, which Supabase's pooler cert
  // fails against Node's default trust store. With no ssl option at all,
  // node-postgres silently connects over plaintext and sends this password
  // unencrypted (AGENTS.md).
  let config = { connectionString: raw, ssl: { rejectUnauthorized: false } };

  const directHost = raw.match(/@db\.([a-z0-9-]+)\.supabase\.co/);
  if (directHost) {
    const url = new URL(raw);
    config = {
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${directHost[1]}`,
      // Decoded: URL.password returns the percent-encoded form, and a password
      // containing an escaped character would otherwise be sent as the literal
      // escape sequence.
      password: decodeURIComponent(url.password),
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    };
  }

  const client = new Client(config);
  await client.connect();
  return client;
}

/**
 * Every pending row across every reviewed table, oldest id first.
 *
 * `select *` rather than a column list: the ids embed their creation epoch
 * (`s_<ms>`), so ordering by id is chronological, and the callers need
 * different subsets (the manifest wants every field, the workflow wants three).
 * Narrowing here would just mean two queries.
 */
async function listPending(client) {
  const out = [];
  for (const table of Object.keys(TABLES)) {
    const { rows } = await client.query(
      `select * from public."${table}" where review_state = 'pending' order by id asc`,
    );
    for (const row of rows) out.push({ table, row });
  }
  return out;
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '_(tom)_';
  if (Array.isArray(value)) return value.length ? value.map((v) => `\`${v}\``).join(', ') : '_(tom)_';
  return String(value);
}

/**
 * A submission rendered as a reviewable Markdown file.
 *
 * Long free text (descriptions, post bodies, prompts) goes in fenced blocks
 * rather than inline: it is submitter-controlled and will contain Markdown, and
 * unfenced it would reflow the manifest into whatever headings the submitter
 * chose. Fencing also means a diff shows the content verbatim.
 */
function renderManifest(table, row) {
  const spec = assertTable(table);
  const long = new Set(['description_en', 'description_da', 'content_da', 'excerpt_da', 'system_prompt_en', 'prompts']);

  const lines = [
    `# ${spec.label}: ${row.title_da ?? row.name ?? row.id}`,
    '',
    '> Indsendt af en agent via API. Ikke offentlig endnu.',
    '> **Merge = godkend** (posten bliver synlig). **Luk uden merge = afvis** (rækken slettes).',
    '',
    `- **Tabel:** \`${table}\``,
    `- **ID:** \`${row.id}\``,
    '',
    '## Indhold',
    '',
  ];

  // Short fields first as one unbroken bullet list, long fields after as their
  // own sections. Interleaving them in declaration order put an `###` heading
  // in the middle of the bullet run and split it into three lists.
  const short = spec.fields.filter(([c]) => !long.has(c));
  const blocks = spec.fields.filter(([c]) => long.has(c));

  for (const [column, label] of short) {
    lines.push(`- **${label}:** ${formatValue(row[column])}`);
  }

  for (const [column, label] of blocks) {
    const value = row[column];
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push('', `### ${label}`, '', ...value.map((v) => `- ${v}`));
    } else if (value) {
      // Fenced: the content is submitter-controlled and will contain Markdown,
      // which unfenced would reflow the manifest into the submitter's headings.
      lines.push('', `### ${label}`, '', '```text', String(value), '```');
    }
  }

  lines.push('', '---', '', `Kanonisk hub efter godkendelse: \`${spec.hub}\``, '');
  return lines.join('\n');
}

/** Tags to invalidate so an approved row actually becomes visible. */
function tagsFor(table, row) {
  const spec = assertTable(table);
  return [spec.listTag, ...(spec.extraTags ?? []), ...spec.rowTag(row)];
}

/**
 * Ask the running site to drop the caches an approval affects.
 *
 * Best-effort by design: the row is already approved in Postgres at this point,
 * so a failed revalidation delays visibility but never loses the approval. It
 * warns loudly rather than failing the job, because a non-zero exit here would
 * make a *successful* approval look like a broken one.
 */
async function revalidate(tags) {
  const base = process.env.SITE_ORIGIN || 'https://vibetrends.dk';
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.warn('::warning::REVALIDATE_SECRET not set — approved rows will not appear until their cache entry expires (cacheLife max = 30 days).');
    return;
  }
  if (!tags.length) return;

  // try/catch, not just an !res.ok check: fetch REJECTS on DNS failure,
  // connect timeout and TLS error. Uncaught, that propagates to main().catch
  // and exits 1 — turning a successful approval (the UPDATE has already
  // committed by this point) into a red job, which is the exact outcome this
  // function's contract promises to avoid.
  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tags: [...new Set(tags)] }),
    });
    if (!res.ok) {
      console.warn(`::warning::Revalidation failed (${res.status}). Rows are approved; the site will catch up on the next cache expiry or deploy.`);
      return;
    }
    console.log(`Revalidated ${new Set(tags).size} tag(s).`);
  } catch (err) {
    console.warn(`::warning::Revalidation request failed (${err.message}). Rows are approved; the site will catch up on the next cache expiry or deploy.`);
  }
}

async function approve(client, targets) {
  const tags = [];
  for (const { table, id } of targets) {
    assertTable(table);
    const { rows } = await client.query(
      `update public."${table}"
          set review_state = 'approved'
        where id = $1 and review_state = 'pending'
        returning *`,
      [id],
    );
    if (!rows.length) {
      // Not an error: re-running an approve job, or a row already handled by
      // hand. Idempotent by construction.
      console.log(`- ${table}/${id}: no pending row (already approved or deleted) — skipped`);
      continue;
    }
    tags.push(...tagsFor(table, rows[0]));
    console.log(`- ${table}/${id}: approved`);
  }
  await revalidate(tags);
}

async function reject(client, targets) {
  for (const { table, id } of targets) {
    assertTable(table);
    // Scoped to review_state='pending' so a rejection can never delete a live,
    // approved catalog entry — a stale PR closed weeks after the row was
    // approved by other means must be a no-op, not a deletion.
    const { rowCount } = await client.query(
      `delete from public."${table}" where id = $1 and review_state = 'pending'`,
      [id],
    );
    console.log(rowCount ? `- ${table}/${id}: rejected and deleted` : `- ${table}/${id}: no pending row — skipped`);
  }
  // No revalidation: a pending row was never in any cached read.
}

/** Parse `submissions/<table>/<id>.md` paths (one per line on stdin or argv). */
function targetsFromPaths(paths) {
  const targets = [];
  for (const p of paths) {
    const m = p.trim().match(/^submissions\/([a-z_]+)\/(.+)\.md$/);
    if (!m) continue;
    // Skip, don't throw. The regex accepts any directory name, so a PR that
    // also touches submissions/<something-else>/x.md — hand-created, or a
    // table added to the workflow's grep before this map — would otherwise
    // abort the whole resolve job and strand the legitimate manifests
    // alongside it. Matches how a non-matching path is already handled.
    if (!Object.hasOwn(TABLES, m[1])) {
      console.warn(`::warning::Ignoring manifest for unknown table "${m[1]}": ${p.trim()}`);
      continue;
    }
    targets.push({ table: m[1], id: m[2] });
  }
  return targets;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const client = await connect();

  try {
    if (command === 'list') {
      const pending = await listPending(client);
      // JSON on stdout so the workflow can consume it; everything else goes to
      // stderr to keep the two streams separable.
      console.log(JSON.stringify(pending.map(({ table, row }) => ({
        table,
        id: row.id,
        title: row.title_da ?? row.name ?? row.id,
        path: `submissions/${table}/${row.id}.md`,
      })), null, 2));
      return;
    }

    if (command === 'manifest') {
      const [table, id] = args;
      assertTable(table);
      const { rows } = await client.query(`select * from public."${table}" where id = $1`, [id]);
      if (!rows.length) throw new Error(`No row ${table}/${id}`);
      process.stdout.write(renderManifest(table, rows[0]));
      return;
    }

    if (command === 'approve' || command === 'reject') {
      // Either `<table> <id>` pairs, or --paths-from <file> holding manifest
      // paths (what the workflow passes, from the PR's changed-file list).
      let targets;
      if (args[0] === '--paths-from') {
        targets = targetsFromPaths(readFileSync(args[1], 'utf8').split('\n').filter(Boolean));
      } else {
        targets = [];
        for (let i = 0; i < args.length; i += 2) targets.push({ table: args[i], id: args[i + 1] });
      }
      if (!targets.length) {
        console.log('No submission manifests in this change — nothing to do.');
        return;
      }
      await (command === 'approve' ? approve(client, targets) : reject(client, targets));
      return;
    }

    throw new Error(`Usage: review-queue.mjs <list|manifest|approve|reject> ...`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
