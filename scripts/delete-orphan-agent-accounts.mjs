// Deletes anonymous auth.users that own nothing and have gone quiet (growth
// decision D5). Dry run by default: it only changes data with --apply.
//
// An orphan is an anonymous account older than 7 days with no row in any
// content, upvote, analytics or storage table, no session activity in the last
// 7 days, and not on the keep list. A rate-limit row does not keep an account:
// it is a counter that is never purged, so it says the account once tried to
// write, not that it owns anything. Those rows are reported, and any left
// behind are inert because nothing can authenticate as a deleted id.
//
// The keep list is load-bearing. A stable agent identity with no rows yet looks
// exactly like an orphan, and deleting it kills the refresh token its owner
// depends on. Session activity does not cover that: a loop that paused for a
// week has none. So --apply refuses to run without explicit keep ids, which
// never live in the repo: ORPHAN_CLEANUP_KEEP_IDS and/or --keep-file.
//
// Run:
//   node --env-file=.env.local scripts/delete-orphan-agent-accounts.mjs [--keep-file <path>]
//   ... --apply --expect <dry-run count> --backup <path outside the repo> [--keep-file <path>]
//   ... --apply --expect <n> --backup <path> --confirm-no-stable-identity
//   ... --restore <backup path>
//
// Re-running is safe: nothing left selects nothing, and a changed count aborts.
// --restore puts the auth.users rows back but not their sessions, so a restored
// account's old refresh token stays dead.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { connect } from "./lib/db.mjs";
import { parseOwnerIds } from "./lib/analyticsDelta.mjs";

/** Every public FK to auth.users, with the delete rule it must have. A set null
 * rule is why ownership has to be checked first: deleting the account would
 * quietly strip authorship from the row. checkSchema compares this to the live
 * catalog and aborts on any difference. */
export const OWNERSHIP_FKS = {
  skills: "set null",
  vibes: "set null",
  agents: "set null",
  blog_posts: "set null",
  forum_threads: "set null",
  forum_replies: "set null",
  analytics_events: "set null",
  skill_upvotes: "cascade",
  vibes_upvotes: "cascade",
  agent_upvotes: "cascade",
  thread_upvotes: "cascade",
  reply_upvotes: "cascade",
};

const AGE = "interval '7 days'";

const ownsRow = (tables) =>
  tables.map((t) => `exists (select 1 from public.${t} o where o.user_id = u.id)`).join(" or ");

/** Why an anonymous account is not an orphan. Report and delete share these, so
 * what the dry run counts is what --apply selects. $1 is the keep list. */
const KEEP_REASONS = {
  on_keep_list: "u.id = any($1::uuid[])",
  younger_than_7d: `u.created_at >= now() - ${AGE}`,
  owns_content: ownsRow(["skills", "vibes", "agents", "blog_posts", "forum_threads", "forum_replies"]),
  owns_upvote: ownsRow(["skill_upvotes", "vibes_upvotes", "agent_upvotes", "thread_upvotes", "reply_upvotes"]),
  in_analytics: ownsRow(["analytics_events"]),
  owns_storage: `exists (select 1 from storage.objects s where coalesce(s.owner_id, s.owner::text) = u.id::text)`,
  recent_activity:
    `coalesce(u.last_sign_in_at >= now() - ${AGE}, false)` +
    ` or exists (select 1 from auth.sessions s where s.user_id = u.id and s.updated_at >= now() - ${AGE})`,
};

/** Reported by the dry run, never a reason to keep (D5). These tables have no
 * user_id: identity lives in text keys (agentwrite:<uid>, humanwrite:<uid>,
 * dbwrite:<uid>), so the match has to be on the text. */
const REPORTED_ONLY = {
  in_rate_limits: `exists (select 1 from public.rate_limits r where position(u.id::text in r.key) > 0)`,
  in_rate_limit_audit: `exists (select 1 from public.rate_limit_rpc_audit a where position(u.id::text in a.p_key) > 0)`,
};

export const ORPHAN_PREDICATE = [
  "u.is_anonymous",
  ...Object.values(KEEP_REASONS).map((sql) => `not (${sql})`),
].join(" and ");

/** What the backup holds: enough to re-insert the row. confirmed_at is generated
 * and anonymous rows have no email, phone or password, so nothing is lost. */
const USER_COLUMNS = [
  "id",
  "instance_id",
  "aud",
  "role",
  "created_at",
  "updated_at",
  "last_sign_in_at",
  "raw_app_meta_data",
  "raw_user_meta_data",
  "is_anonymous",
  "is_sso_user",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseKeepIds({ envValue, file }) {
  const fileLines = file ? readFileSync(file, "utf8").split("\n") : [];
  const raw = [...String(envValue ?? "").split(","), ...fileLines]
    .map((line) => line.replace(/#.*/, "").trim().toLowerCase())
    .filter(Boolean);
  for (const id of raw) {
    if (!UUID.test(id)) throw new Error(`keep id is not a uuid: ${id}`);
  }
  return [...new Set(raw)];
}

export async function checkSchema(client) {
  const { rows } = await client.query(`
    select c.relname as tbl,
           case con.confdeltype when 'c' then 'cascade' when 'n' then 'set null'
                                when 'a' then 'no action' when 'r' then 'restrict'
                                else 'set default' end as on_delete
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f' and con.confrelid = 'auth.users'::regclass and n.nspname = 'public'
  `);
  const live = new Map(rows.map((r) => [r.tbl, r.on_delete]));
  const problems = [];
  for (const [tbl, rule] of live) {
    if (!(tbl in OWNERSHIP_FKS)) problems.push(`${tbl}: FK not known to this script`);
    else if (OWNERSHIP_FKS[tbl] !== rule) problems.push(`${tbl}: on delete ${rule}, expected ${OWNERSHIP_FKS[tbl]}`);
  }
  for (const tbl of Object.keys(OWNERSHIP_FKS)) {
    if (!live.has(tbl)) problems.push(`${tbl}: expected FK is missing`);
  }
  if (problems.length) throw new Error(`schema changed, aborting:\n  ${problems.join("\n  ")}`);
}

export function assertBackupOutsideRepo(backupPath) {
  const gitDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: import.meta.dirname, encoding: "utf8" },
  ).trim();
  const relative = path.relative(path.dirname(gitDir), path.resolve(backupPath));
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(`--backup must be outside the repo: ${backupPath}`);
  }
}

async function findUnknownIds(client, ids) {
  if (ids.length === 0) return [];
  const { rows } = await client.query("select id from auth.users where id = any($1::uuid[])", [ids]);
  const found = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !found.has(id));
}

/** Counts only: reasons overlap, and no ids reach the terminal. */
export async function dryRun(client, { keepIds, ownerIds }) {
  await client.query("BEGIN READ ONLY");
  try {
    await checkSchema(client);
    const unknownKeepIds = await findUnknownIds(client, keepIds);
    const reasons = Object.entries({ ...KEEP_REASONS, ...REPORTED_ONLY })
      .map(([name, sql]) => `count(*) filter (where ${sql}) as ${name}`)
      .join(", ");
    const { rows } = await client.query(
      `select count(*) as anonymous, count(*) filter (where ${ORPHAN_PREDICATE}) as candidates,
              (min(u.created_at) filter (where ${ORPHAN_PREDICATE}))::date::text as oldest_candidate,
              count(*) filter (where ${ORPHAN_PREDICATE}
                and extract(hour from u.created_at at time zone 'UTC') = 6) as candidates_06_utc,
              to_char(max(u.created_at) filter (where ${ORPHAN_PREDICATE}) at time zone 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS"Z"') as newest_candidate,
              ${reasons}
       from auth.users u where u.is_anonymous`,
      [[...keepIds, ...ownerIds]],
    );
    return { counts: rows[0], unknownKeepIds };
  } finally {
    await client.query("ROLLBACK");
  }
}

export async function applyDelete(client, { keepIds, ownerIds, expect, backupPath, confirmNoStableIdentity }) {
  if (keepIds.length === 0 && !confirmNoStableIdentity) {
    throw new Error(
      "no exclusion input: a stable agent identity with no rows would be deleted. Pass " +
        "ORPHAN_CLEANUP_KEEP_IDS or --keep-file, or --confirm-no-stable-identity if none exists.",
    );
  }
  if (expect === undefined) throw new Error("--apply needs --expect <count approved from the dry run>");
  if (!backupPath) throw new Error("--apply needs --backup <path outside the repo>");
  assertBackupOutsideRepo(backupPath);

  await client.query("BEGIN");
  try {
    await checkSchema(client);
    const unknown = await findUnknownIds(client, keepIds);
    if (unknown.length) throw new Error(`keep ids not found in auth.users: ${unknown.join(", ")}`);

    const keep = [...keepIds, ...ownerIds];
    const { rows: users } = await client.query(
      `select ${USER_COLUMNS.map((c) => `u.${c}`).join(", ")}
       from auth.users u where ${ORPHAN_PREDICATE} for update of u`,
      [keep],
    );

    if (users.length === 0) {
      await client.query("ROLLBACK");
      return { deleted: 0 };
    }
    if (users.length !== expect) {
      throw new Error(`found ${users.length} orphans, approved ${expect}. Re-run the dry run.`);
    }

    // Written before the delete and never overwritten: flag wx throws on an
    // existing file. A later failure rolls back and leaves a harmless backup.
    writeFileSync(backupPath, `${JSON.stringify({ deleted_at: new Date().toISOString(), users }, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });

    // The predicate is repeated so a row written since the select keeps its owner.
    const { rowCount } = await client.query(
      `delete from auth.users u where u.id = any($2::uuid[]) and ${ORPHAN_PREDICATE}`,
      [keep, users.map((u) => u.id)],
    );
    if (rowCount !== users.length) {
      throw new Error(`deleted ${rowCount} of ${users.length}, rolled back. Backup at ${backupPath} was not applied.`);
    }
    await client.query("COMMIT");
    return { deleted: rowCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function restore(client, file) {
  const { users } = JSON.parse(readFileSync(file, "utf8"));
  const placeholders = USER_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
  await client.query("BEGIN");
  try {
    let restored = 0;
    for (const user of users) {
      const { rowCount } = await client.query(
        `insert into auth.users (${USER_COLUMNS.join(", ")}) values (${placeholders})
         on conflict (id) do nothing`,
        USER_COLUMNS.map((c) => user[c]),
      );
      restored += rowCount;
    }
    await client.query("COMMIT");
    return { restored };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      expect: { type: "string" },
      backup: { type: "string" },
      restore: { type: "string" },
      "keep-file": { type: "string" },
      "confirm-no-stable-identity": { type: "boolean", default: false },
    },
  });

  const keepIds = parseKeepIds({ envValue: process.env.ORPHAN_CLEANUP_KEEP_IDS, file: values["keep-file"] });
  const ownerIds = [...parseOwnerIds(process.env.ANALYTICS_OWNER_USER_IDS)];
  const client = await connect();
  try {
    if (values.restore) {
      console.log(await restore(client, values.restore));
    } else if (values.apply) {
      console.log(
        await applyDelete(client, {
          keepIds,
          ownerIds,
          expect: values.expect === undefined ? undefined : Number(values.expect),
          backupPath: values.backup,
          confirmNoStableIdentity: values["confirm-no-stable-identity"],
        }),
      );
    } else {
      const { counts, unknownKeepIds } = await dryRun(client, { keepIds, ownerIds });
      console.log("DRY RUN, nothing changed.");
      console.log(`Live FKs match the ${Object.keys(OWNERSHIP_FKS).length} tables this script knows.`);
      console.log(`Keep ids given: ${keepIds.length}. Owner ids excluded: ${ownerIds.length}.`);
      if (keepIds.length === 0) console.log("WARNING: no keep ids. --apply will refuse without them.");
      if (unknownKeepIds.length) console.log(`WARNING: keep ids not in auth.users: ${unknownKeepIds.join(", ")}`);
      console.table(counts);
    }
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
