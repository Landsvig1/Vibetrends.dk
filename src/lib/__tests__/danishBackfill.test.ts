import { describe, it, expect } from "vitest";
import {
  validateBackfillEntries,
  isBackfillTable,
  BACKFILL_TABLES,
  type BackfillEntry,
  type LiveRow,
} from "@/lib/danishBackfill";

function live(rows: Record<string, Partial<LiveRow>>): Map<string, LiveRow> {
  return new Map(
    Object.entries(rows).map(([key, r]) => [
      key,
      { description_en: r.description_en ?? "English text", description_da: r.description_da ?? null },
    ])
  );
}

const entry = (over: Partial<BackfillEntry> = {}): BackfillEntry => ({
  table: "skills",
  id: "s1",
  descriptionEn: "English text",
  descriptionDa: "Dansk tekst",
  ...over,
});

describe("BACKFILL_TABLES", () => {
  it("restricts agents to the two catalog categories so Host rows are never translated", () => {
    const agents = BACKFILL_TABLES.find((t) => t.name === "agents")!;
    expect(agents.extraWhere).toContain("CLI");
    expect(agents.extraWhere).toContain("MCP Server");
    expect(agents.extraWhere).not.toContain("Host");
  });

  it("covers exactly the three tables with translatable descriptions", () => {
    expect(BACKFILL_TABLES.map((t) => t.name)).toEqual(["skills", "vibes", "agents"]);
  });

  it("rejects unknown table names", () => {
    expect(isBackfillTable("skills")).toBe(true);
    expect(isBackfillTable("forum_threads")).toBe(false);
    expect(isBackfillTable(undefined)).toBe(false);
  });
});

describe("validateBackfillEntries — accepts good input", () => {
  it("plans a write for a well-formed entry", () => {
    const { problems, writes } = validateBackfillEntries([entry()], live({ "skills/s1": {} }));
    expect(problems).toEqual([]);
    expect(writes).toEqual([{ table: "skills", id: "s1", descriptionDa: "Dansk tekst" }]);
  });

  it("trims surrounding whitespace off the translation", () => {
    const { writes } = validateBackfillEntries(
      [entry({ descriptionDa: "  Dansk tekst  " })],
      live({ "skills/s1": {} })
    );
    expect(writes[0].descriptionDa).toBe("Dansk tekst");
  });

  it("accepts an explicit skip and plans no write for it", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry({ skip: true, descriptionDa: "" })],
      live({ "skills/s1": {} })
    );
    expect(problems).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe("validateBackfillEntries — misalignment guard", () => {
  it("rejects an entry whose echoed English does not match the live row", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry({ descriptionEn: "Some other row's English" })],
      live({ "skills/s1": { description_en: "English text" } })
    );
    expect(writes).toEqual([]);
    expect(problems[0]).toContain("paired with the wrong entry");
  });

  it("rejects both halves of a swapped pair — the core misalignment scenario", () => {
    // Two rows whose translations were written under each other's ids. Every
    // other check passes: both are non-empty, differ from their own English,
    // and target real untranslated rows.
    const rows = live({
      "skills/s1": { description_en: "Serverless Postgres" },
      "skills/s2": { description_en: "Error tracking" },
    });
    const swapped: BackfillEntry[] = [
      { table: "skills", id: "s1", descriptionEn: "Error tracking", descriptionDa: "Fejlsporing" },
      { table: "skills", id: "s2", descriptionEn: "Serverless Postgres", descriptionDa: "Serverløs Postgres" },
    ];

    const { problems, writes } = validateBackfillEntries(swapped, rows);

    expect(writes).toEqual([]);
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.includes("paired with the wrong entry"))).toBe(true);
  });
});

describe("validateBackfillEntries — passthrough and overwrite guards", () => {
  it("rejects a translation identical to the English", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry({ descriptionDa: "English text" })],
      live({ "skills/s1": { description_en: "English text" } })
    );
    expect(writes).toEqual([]);
    expect(problems[0]).toContain("untranslated passthrough");
  });

  it("refuses to overwrite a row translated between export and apply", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry()],
      live({ "skills/s1": { description_da: "Allerede oversat" } })
    );
    expect(writes).toEqual([]);
    expect(problems[0]).toContain("already set");
  });

  it("is idempotent: re-applying a file whose rows are now translated writes nothing", () => {
    const applied = live({ "skills/s1": { description_da: "Dansk tekst" } });
    const { problems, writes } = validateBackfillEntries([entry()], applied);
    expect(writes).toEqual([]);
    expect(problems).toHaveLength(1);
  });

  it("rejects an empty translation rather than treating it as a skip", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry({ descriptionDa: "   " })],
      live({ "skills/s1": {} })
    );
    expect(writes).toEqual([]);
    expect(problems[0]).toContain('use "skip": true');
  });
});

describe("validateBackfillEntries — completeness and shape guards", () => {
  it("reports a row present in the database but missing from the file", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry()],
      live({ "skills/s1": {}, "skills/s2": {} })
    );
    expect(writes).toHaveLength(1);
    expect(problems).toEqual(["skills/s2: present in the database but missing from the file"]);
  });

  it("reports an entry referencing a row that does not exist", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry({ id: "ghost" })],
      live({ "skills/s1": {} })
    );
    expect(writes).toEqual([]);
    expect(problems.some((p) => p.includes("no such row"))).toBe(true);
  });

  it("rejects a duplicate entry for the same row", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry(), entry({ descriptionDa: "Anden oversættelse" })],
      live({ "skills/s1": {} })
    );
    expect(writes).toHaveLength(1);
    expect(problems.some((p) => p.includes("duplicate entry"))).toBe(true);
  });

  it("rejects an unknown table", () => {
    const { problems } = validateBackfillEntries(
      [entry({ table: "forum_threads" })],
      live({ "skills/s1": {} })
    );
    expect(problems.some((p) => p.includes("unknown table"))).toBe(true);
  });

  it("rejects an entry missing its id", () => {
    const { problems } = validateBackfillEntries(
      [{ table: "skills", descriptionEn: "English text", descriptionDa: "Dansk" }],
      live({ "skills/s1": {} })
    );
    expect(problems.some((p) => p.includes("missing table or id"))).toBe(true);
  });

  it("collects every problem in one pass rather than stopping at the first", () => {
    const { problems } = validateBackfillEntries(
      [entry({ id: "ghost" }), entry({ table: "forum_threads" })],
      live({ "skills/s1": {} })
    );
    expect(problems.length).toBeGreaterThanOrEqual(3); // ghost, unknown table, s1 missing
  });

  it("writes nothing when any entry fails — the caller applies all-or-nothing", () => {
    const { problems, writes } = validateBackfillEntries(
      [entry(), entry({ id: "s2", descriptionEn: "wrong" })],
      live({ "skills/s1": {}, "skills/s2": {} })
    );
    // validate still reports the good write; the script refuses to apply any of
    // them while problems is non-empty. Both halves of that contract matter.
    expect(writes).toHaveLength(1);
    expect(problems).not.toEqual([]);
  });
});
