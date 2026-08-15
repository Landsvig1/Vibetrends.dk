import { describe, it, expect } from "vitest";
import { renderManifest } from "../scan-hot-skills.mjs";
import { parseManifest } from "../publish-hot-ranking.mjs";

/**
 * The manifest is the contract between the two halves of this system: the scan
 * writes it, a human edits it in a pull request, and merging it makes the
 * publisher read it back. Those two live in different files and run in
 * different workflows, so nothing but a round-trip test stops a column being
 * added on one side and silently shifting the id the other side publishes.
 *
 * It is also the trust boundary. The manifest is a file in a pull request, and
 * whatever survives parsing is written to a public board.
 */

const boardRow = (position, id, title, score) => ({
  position,
  catalog: { id, slug: title, title, repo: null },
  entry: {
    key: id,
    slug: title,
    repo: null,
    score,
    contributions: [{ source: "skills.sh", rank: position, value: 1000 - position }],
  },
});

const board = [
  boardRow(1, "s_1785096155359", "find-skills", 0.27273),
  boardRow(2, "seed_shadcn", "shadcn", 0.25),
  boardRow(3, "s_1785096155360", "agent-browser", 0.23077),
  boardRow(4, "seed_frontend-design", "frontend-design", 0.21429),
  boardRow(5, "s_1785096155361", "tdd", 0.2),
];

const report = {
  used: [{ source: "skills.sh", weight: 1, count: 5 }],
  dropped: [],
};

describe("manifest round-trip", () => {
  it("publishes exactly the ids and order the scan proposed", () => {
    const parsed = parseManifest(renderManifest("2026-W33", board, report, []));
    expect(parsed.map((r) => r.skillId)).toEqual([
      "s_1785096155359",
      "seed_shadcn",
      "s_1785096155360",
      "seed_frontend-design",
      "s_1785096155361",
    ]);
    expect(parsed.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("carries the score through", () => {
    const parsed = parseManifest(renderManifest("2026-W33", board, report, []));
    expect(parsed[0].score).toBeCloseTo(0.27273, 5);
  });

  it("ignores the header, the separator, the sources section and the HTML comment", () => {
    const parsed = parseManifest(
      renderManifest("2026-W33", board, report, ["skills.sh: 12 entries had no weekly baseline"])
    );
    expect(parsed).toHaveLength(5);
  });

  it("survives a dropped-sources section in the manifest", () => {
    const withDropped = renderManifest("2026-W33", board, {
      used: [{ source: "skills.sh", weight: 1, count: 5 }],
      dropped: [{ source: "github-stars", reason: "HTTP 500" }],
    }, []);
    expect(parseManifest(withDropped)).toHaveLength(5);
  });
});

describe("a reviewer editing the manifest", () => {
  const manifest = renderManifest("2026-W33", board, report, []);

  it("honours a deleted row and closes the gap in the numbering", () => {
    // A ranking with a hole in it would violate the (week, position) unique
    // index, so the parser renumbers rather than trusting the printed numbers.
    const edited = manifest
      .split("\n")
      .filter((l) => !l.includes("seed_shadcn"))
      .join("\n");
    const parsed = parseManifest(edited);
    expect(parsed.map((r) => r.skillId)).not.toContain("seed_shadcn");
    expect(parsed.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("honours a reordering done by renumbering the first column", () => {
    const edited = manifest
      .replace("| 1 | find-skills", "| 9 | find-skills")
      .replace("| 2 | shadcn", "| 1 | shadcn");
    const parsed = parseManifest(edited);
    expect(parsed[0].skillId).toBe("seed_shadcn");
    expect(parsed.at(-1).skillId).toBe("s_1785096155359");
  });

  it("produces nothing publishable from an emptied table", () => {
    const edited = manifest
      .split("\n")
      .filter((l) => !/^\| \d+ \|/.test(l))
      .join("\n");
    expect(parseManifest(edited)).toEqual([]);
  });
});

describe("parseManifest — untrusted input", () => {
  const row = (id) => `| 1 | x | \`${id}\` | 0.5 | skills.sh #1 (1) |`;

  it("rejects an id with characters outside the allowlist", () => {
    for (const bad of [
      "a b",
      "a'b",
      "a;drop table skills",
      "a/../b",
      "a\\b",
      '"',
      "id-with-ünicode",
    ]) {
      expect(parseManifest(row(bad))).toEqual([]);
    }
  });

  it("accepts the id shapes this catalog actually uses", () => {
    for (const good of ["s_1785096155359", "seed_frontend-design", "a.b-c_d"]) {
      expect(parseManifest(row(good))).toHaveLength(1);
    }
  });

  it("rejects an over-long id", () => {
    expect(parseManifest(row("a".repeat(129)))).toEqual([]);
  });

  it("ignores rows whose position is not a positive integer", () => {
    expect(parseManifest("| 0 | x | `abc` | 0.5 | s |")).toEqual([]);
    expect(parseManifest("| -1 | x | `abc` | 0.5 | s |")).toEqual([]);
    expect(parseManifest("| foo | x | `abc` | 0.5 | s |")).toEqual([]);
  });

  it("ignores the markdown separator row", () => {
    expect(parseManifest("| --: | --- | --- | --: | --- |")).toEqual([]);
  });

  it("stores a null score rather than NaN when the cell is not a number", () => {
    const parsed = parseManifest("| 1 | x | `abc` | n/a | s |");
    expect(parsed[0].score).toBeNull();
  });

  it("returns nothing for empty input", () => {
    expect(parseManifest("")).toEqual([]);
  });
});
