import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { approve, renderManifest } from "../review-queue.mjs";

/**
 * Merge means "publish what the reviewer saw". The reviewer saw the manifest in
 * the PR diff; approve reads the live row. These tests pin that approve only
 * flips a row whose current render is byte-for-byte the merged manifest, and
 * that a refusal leaves the row pending and is reported, not swallowed.
 */

const vibe = (overrides = {}) => ({
  id: "v_1",
  review_state: "pending",
  title_da: "Demo",
  author: "agent",
  description_en: "A demo project.",
  description_da: null,
  tools: ["Claude Code"],
  prompts: [],
  demo_url: "https://example.com",
  github_url: null,
  image_url: "/images/autonewsletter.jpg",
  slug: "demo",
  ...overrides,
});

/** Just enough of pg.Client for approve: one table, row locks are no-ops. */
function fakeClient(rows) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const queries = [];
  return {
    store,
    queries,
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, " ").trim();
      queries.push(text);
      if (/^(begin|commit|rollback)$/.test(text)) return { rows: [] };
      const row = store.get(params[0]);
      if (text.startsWith("select")) {
        return { rows: row && row.review_state === "pending" ? [{ ...row }] : [] };
      }
      if (text.startsWith("update")) {
        if (!row || row.review_state !== "pending") return { rows: [], rowCount: 0 };
        row.review_state = "approved";
        return { rows: [{ ...row }], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

let root;
const writeManifest = (table, row, body = renderManifest(table, row)) => {
  mkdirSync(path.join(root, "submissions", table), { recursive: true });
  writeFileSync(path.join(root, "submissions", table, `${row.id}.md`), body);
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "review-queue-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("approve", () => {
  it("approves a row whose render matches the merged manifest", async () => {
    const row = vibe();
    writeManifest("vibes", row);
    const client = fakeClient([row]);

    const result = await approve(client, [{ table: "vibes", id: row.id }], { root });

    expect(client.store.get(row.id).review_state).toBe("approved");
    expect(result.refused).toEqual([]);
    expect(client.queries.at(-1)).toBe("commit");
  });

  it("refuses and leaves the row pending when it changed after the manifest was generated", async () => {
    const reviewed = vibe();
    writeManifest("vibes", reviewed);
    const client = fakeClient([vibe({ demo_url: "https://example.net/elsewhere" })]);

    const result = await approve(client, [{ table: "vibes", id: reviewed.id }], { root });

    expect(client.store.get(reviewed.id).review_state).toBe("pending");
    expect(result.refused).toEqual([{ table: "vibes", id: reviewed.id }]);
    expect(client.queries.some((q) => q.startsWith("update"))).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^::error::.*vibes\/v_1/));
  });

  it("refuses when the manifest was edited in the PR but the row was not", async () => {
    const row = vibe();
    writeManifest("vibes", row, renderManifest("vibes", row).replace("A demo project.", "Edited in the PR."));
    const client = fakeClient([row]);

    const result = await approve(client, [{ table: "vibes", id: row.id }], { root });

    expect(client.store.get(row.id).review_state).toBe("pending");
    expect(result.refused).toHaveLength(1);
  });

  it("refuses when the merged manifest is missing", async () => {
    const row = vibe();
    const client = fakeClient([row]);

    const result = await approve(client, [{ table: "vibes", id: row.id }], { root });

    expect(client.store.get(row.id).review_state).toBe("pending");
    expect(result.refused).toHaveLength(1);
  });

  it("still approves the matching rows when another target is refused", async () => {
    const good = vibe({ id: "v_good" });
    const bad = vibe({ id: "v_bad" });
    writeManifest("vibes", good);
    writeManifest("vibes", bad);
    const client = fakeClient([good, { ...bad, description_en: "changed" }]);

    const result = await approve(client, [
      { table: "vibes", id: "v_bad" },
      { table: "vibes", id: "v_good" },
    ], { root });

    expect(client.store.get("v_good").review_state).toBe("approved");
    expect(client.store.get("v_bad").review_state).toBe("pending");
    expect(result.refused).toEqual([{ table: "vibes", id: "v_bad" }]);
  });

  it("skips a row that is no longer pending without refusing", async () => {
    const row = vibe({ review_state: "approved" });
    writeManifest("vibes", row);
    const client = fakeClient([row]);

    const result = await approve(client, [{ table: "vibes", id: row.id }], { root });

    expect(result.refused).toEqual([]);
    expect(client.queries.some((q) => q.startsWith("update"))).toBe(false);
  });
});

describe("renderManifest", () => {
  it("renders the same row to the same bytes", () => {
    expect(renderManifest("vibes", vibe())).toBe(renderManifest("vibes", { ...vibe() }));
  });
});
