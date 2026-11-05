import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  OWNERSHIP_FKS,
  ORPHAN_PREDICATE,
  parseKeepIds,
  checkSchema,
  assertBackupOutsideRepo,
  dryRun,
  applyDelete,
  restore,
} from "../delete-orphan-agent-accounts.mjs";

const KEEP = "11111111-1111-4111-8111-111111111111";
const ORPHAN = "22222222-2222-4222-8222-222222222222";

const liveFks = () =>
  Object.entries(OWNERSHIP_FKS).map(([tbl, on_delete]) => ({ tbl, on_delete }));

const orphanRow = {
  id: ORPHAN,
  instance_id: "00000000-0000-0000-0000-000000000000",
  aud: "authenticated",
  role: "authenticated",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  last_sign_in_at: "2026-09-01T00:00:00.000Z",
  raw_app_meta_data: {},
  raw_user_meta_data: { full_name: "agent_x" },
  is_anonymous: true,
  is_sso_user: false,
};

/** Just enough of pg.Client: answers by query shape and records the order. */
function fakeClient({ fks = liveFks(), candidates = [orphanRow], existing = [KEEP], deleted } = {}) {
  const log = [];
  return {
    log,
    async query(sql, params) {
      log.push({ sql, params });
      if (/pg_constraint/.test(sql)) return { rows: fks };
      if (/select id from auth\.users where id = any/i.test(sql)) {
        return { rows: existing.map((id) => ({ id })) };
      }
      if (/^\s*delete from auth\.users/i.test(sql)) {
        return { rowCount: deleted ?? candidates.length, rows: [] };
      }
      if (/insert into auth\.users/i.test(sql)) return { rowCount: 1, rows: [] };
      if (/for update of u/i.test(sql)) return { rows: candidates };
      if (/count\(\*\)/i.test(sql)) return { rows: [{ anonymous: "1", candidates: String(candidates.length) }] };
      return { rows: [] };
    },
    statements() {
      return log.map((q) => q.sql.trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase());
    },
    ran(pattern) {
      return log.some((q) => pattern.test(q.sql));
    },
  };
}

describe("OWNERSHIP_FKS", () => {
  it("covers every public table with a user_id FK, with its delete rule", () => {
    expect(OWNERSHIP_FKS).toEqual({
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
    });
  });

  it("every listed table and text-keyed source is in the delete predicate", () => {
    for (const table of Object.keys(OWNERSHIP_FKS)) {
      expect(ORPHAN_PREDICATE).toContain(`public.${table}`);
    }
    expect(ORPHAN_PREDICATE).toContain("public.rate_limits");
    expect(ORPHAN_PREDICATE).toContain("public.rate_limit_rpc_audit");
    expect(ORPHAN_PREDICATE).toContain("storage.objects");
    expect(ORPHAN_PREDICATE).toContain("auth.sessions");
    expect(ORPHAN_PREDICATE).toContain("u.is_anonymous");
    expect(ORPHAN_PREDICATE).toContain("7 days");
  });
});

describe("checkSchema", () => {
  it("passes when the live FKs match", async () => {
    await expect(checkSchema(fakeClient())).resolves.toBeUndefined();
  });

  it("aborts on a public FK the script does not know about", async () => {
    const client = fakeClient({ fks: [...liveFks(), { tbl: "new_table", on_delete: "cascade" }] });
    await expect(checkSchema(client)).rejects.toThrow(/new_table/);
  });

  it("aborts when a delete rule changed", async () => {
    const fks = liveFks().map((f) => (f.tbl === "skills" ? { ...f, on_delete: "cascade" } : f));
    await expect(checkSchema(fakeClient({ fks }))).rejects.toThrow(/skills/);
  });

  it("aborts when a listed table lost its FK", async () => {
    const fks = liveFks().filter((f) => f.tbl !== "agents");
    await expect(checkSchema(fakeClient({ fks }))).rejects.toThrow(/agents/);
  });
});

describe("parseKeepIds", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "keep-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("merges the env var and the file, skipping comments and duplicates", () => {
    const file = path.join(dir, "keep.txt");
    writeFileSync(file, `# loop identity\n${KEEP}\n${ORPHAN}\n`);
    expect(parseKeepIds({ envValue: KEEP.toUpperCase(), file })).toEqual([KEEP, ORPHAN]);
  });

  it("returns nothing when no input is given", () => {
    expect(parseKeepIds({ envValue: undefined, file: undefined })).toEqual([]);
  });

  it("refuses a value that is not a uuid instead of silently not protecting it", () => {
    expect(() => parseKeepIds({ envValue: "agent_abc", file: undefined })).toThrow(/agent_abc/);
  });
});

describe("assertBackupOutsideRepo", () => {
  it("refuses a path inside the repo", () => {
    expect(() => assertBackupOutsideRepo(path.resolve("scripts/backup.json"))).toThrow(/outside the repo/);
  });

  it("accepts a path outside the repo", () => {
    expect(() => assertBackupOutsideRepo(path.join(tmpdir(), "backup.json"))).not.toThrow();
  });
});

describe("dryRun", () => {
  it("runs read-only and never deletes", async () => {
    const client = fakeClient();
    await dryRun(client, { keepIds: [KEEP], ownerIds: [] });
    expect(client.statements()[0]).toBe("BEGIN READ");
    expect(client.ran(/delete from/i)).toBe(false);
    expect(client.statements().at(-1)).toBe("ROLLBACK");
  });

  it("reports the 06 UTC cohort and the newest candidate in UTC, not session time", async () => {
    const client = fakeClient();
    await dryRun(client, { keepIds: [], ownerIds: [] });
    const report = client.log.find((q) => /count\(\*\)/i.test(q.sql)).sql;
    expect(report).toMatch(/extract\(hour from u\.created_at at time zone 'UTC'\) = 6[^,]*as candidates_06_utc/);
    expect(report).toMatch(/at time zone 'UTC'[^,]*,\s*'YYYY-MM-DD"T"HH24:MI:SS"Z"'\) as newest_candidate/);
  });

  it("flags a keep id that does not exist", async () => {
    const report = await dryRun(fakeClient({ existing: [] }), { keepIds: [KEEP], ownerIds: [] });
    expect(report.unknownKeepIds).toEqual([KEEP]);
  });
});

describe("applyDelete", () => {
  let dir, backupPath;
  const opts = (over = {}) => ({
    keepIds: [KEEP],
    ownerIds: [],
    expect: 1,
    backupPath,
    confirmNoStableIdentity: false,
    ...over,
  });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "orphans-"));
    backupPath = path.join(dir, "backup.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("refuses to run with no exclusion input, the stable loop identity trap", async () => {
    const client = fakeClient();
    await expect(applyDelete(client, opts({ keepIds: [] }))).rejects.toThrow(/exclusion/);
    expect(client.log).toEqual([]);
  });

  it("runs with no keep ids only when that is explicitly acknowledged", async () => {
    const client = fakeClient();
    await applyDelete(client, opts({ keepIds: [], confirmNoStableIdentity: true }));
    expect(client.ran(/^\s*delete from auth\.users/i)).toBe(true);
  });

  it("does not count owner ids as the exclusion input", async () => {
    const client = fakeClient();
    await expect(applyDelete(client, opts({ keepIds: [], ownerIds: [KEEP] }))).rejects.toThrow(/exclusion/);
  });

  it("refuses without an approved count or a backup path", async () => {
    await expect(applyDelete(fakeClient(), opts({ expect: undefined }))).rejects.toThrow(/--expect/);
    await expect(applyDelete(fakeClient(), opts({ backupPath: undefined }))).rejects.toThrow(/--backup/);
  });

  it("aborts on a keep id that does not exist, it may be a typo for the real one", async () => {
    const client = fakeClient({ existing: [] });
    await expect(applyDelete(client, opts())).rejects.toThrow(KEEP);
    expect(client.ran(/^\s*delete from/i)).toBe(false);
    expect(client.statements().at(-1)).toBe("ROLLBACK");
  });

  it("rolls back when the live count differs from the approved one", async () => {
    const client = fakeClient();
    await expect(applyDelete(client, opts({ expect: 5 }))).rejects.toThrow(/approved 5/);
    expect(client.ran(/^\s*delete from/i)).toBe(false);
    expect(existsSync(backupPath)).toBe(false);
    expect(client.statements().at(-1)).toBe("ROLLBACK");
  });

  it("writes a private backup before the delete and re-checks the predicate in it", async () => {
    const client = fakeClient();
    const result = await applyDelete(client, opts());

    expect(result.deleted).toBe(1);
    expect(client.statements().at(-1)).toBe("COMMIT");
    const backup = JSON.parse(readFileSync(backupPath, "utf8"));
    expect(backup.users[0].id).toBe(ORPHAN);
    expect(backup.users[0].created_at).toBe(orphanRow.created_at);
    expect(statSync(backupPath).mode & 0o777).toBe(0o600);

    const del = client.log.find((q) => /^\s*delete from auth\.users/i.test(q.sql));
    expect(del.sql).toContain(ORPHAN_PREDICATE);
    expect(del.params[0]).toEqual([KEEP]);
    expect(del.params[1]).toEqual([ORPHAN]);
  });

  it("rolls back when the delete touched a different number of rows", async () => {
    const client = fakeClient({ deleted: 0 });
    await expect(applyDelete(client, opts())).rejects.toThrow(/deleted 0/);
    expect(client.statements().at(-1)).toBe("ROLLBACK");
  });

  it("is a no-op on a re-run with nothing left, keeping the first backup", async () => {
    writeFileSync(backupPath, "first run");
    const client = fakeClient({ candidates: [] });
    const result = await applyDelete(client, opts());
    expect(result.deleted).toBe(0);
    expect(client.ran(/^\s*delete from/i)).toBe(false);
    expect(readFileSync(backupPath, "utf8")).toBe("first run");
  });

  it("refuses to overwrite an existing backup", async () => {
    writeFileSync(backupPath, "first run");
    const client = fakeClient();
    await expect(applyDelete(client, opts())).rejects.toThrow(/EEXIST/);
    expect(client.ran(/^\s*delete from/i)).toBe(false);
    expect(readFileSync(backupPath, "utf8")).toBe("first run");
  });
});

describe("restore", () => {
  it("re-inserts backed up rows idempotently in one transaction", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "restore-"));
    const file = path.join(dir, "backup.json");
    writeFileSync(file, JSON.stringify({ users: [orphanRow] }));
    const client = fakeClient();

    const result = await restore(client, file);

    expect(result.restored).toBe(1);
    const insert = client.log.find((q) => /insert into auth\.users/i.test(q.sql));
    expect(insert.sql).toMatch(/on conflict \(id\) do nothing/i);
    expect(insert.params).toContain(ORPHAN);
    expect(client.statements()[0]).toBe("BEGIN");
    expect(client.statements().at(-1)).toBe("COMMIT");
    rmSync(dir, { recursive: true, force: true });
  });
});
