import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * These tests characterize the CURRENT behavior of the data layer so the
 * Phase 2 performance refactor (U4/U5) can change the queries underneath them
 * without silently changing results. We mock the Supabase client module so the
 * suite is hermetic — no live database.
 *
 * The mock implements just enough of the PostgREST query-builder surface that
 * db.ts uses: a chainable builder that records its operations and resolves to a
 * configurable { data, error } when awaited (or after .single()).
 */

interface BuilderOps {
  table: string;
  method: "select" | "insert" | "delete" | "update";
  select?: string;
  payload?: unknown;
  single: boolean;
  filters: Array<[string, ...unknown[]]>;
}

type Handler = (ops: BuilderOps) => { data: unknown; error: unknown };

const state = vi.hoisted(() => {
  return {
    // Per-test handlers. Given the recorded ops, return { data, error }.
    publicHandler: (() => ({ data: [], error: null })) as Handler,
    serverHandler: (() => ({ data: null, error: null })) as Handler,
    user: null as { id: string } | null,
    publicCalls: [] as BuilderOps[],
    serverCalls: [] as BuilderOps[],
  };
});

function makeBuilder(
  table: string,
  sink: BuilderOps[],
  handler: (ops: BuilderOps) => { data: unknown; error: unknown }
) {
  const ops: BuilderOps = { table, method: "select", filters: [], single: false };
  let recorded = false;
  const record = () => {
    if (!recorded) {
      sink.push(ops);
      recorded = true;
    }
  };

  const builder: Record<string, unknown> = {
    select(cols?: string) {
      ops.select = cols;
      return builder;
    },
    insert(payload: unknown) {
      ops.method = "insert";
      ops.payload = payload;
      return builder;
    },
    update(payload: unknown) {
      ops.method = "update";
      ops.payload = payload;
      return builder;
    },
    delete() {
      ops.method = "delete";
      return builder;
    },
    eq(col: string, val: unknown) {
      ops.filters.push(["eq", col, val]);
      return builder;
    },
    neq(col: string, val: unknown) {
      ops.filters.push(["neq", col, val]);
      return builder;
    },
    order(col: string, opt: unknown) {
      ops.filters.push(["order", col, opt]);
      return builder;
    },
    single() {
      ops.single = true;
      record();
      return Promise.resolve(handler(ops));
    },
    then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      record();
      return Promise.resolve(handler(ops)).then(onF, onR);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase-server", () => {
  return {
    supabasePublic: {
      from: (table: string) => makeBuilder(table, state.publicCalls, state.publicHandler),
    },
    createSupabaseServerClient: async () => ({
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      from: (table: string) => makeBuilder(table, state.serverCalls, state.serverHandler),
    }),
    getAuthUser: vi.fn(),
  };
});

import * as db from "@/lib/db";

const skillRow = {
  id: "s1",
  title_da: "Titel DA",
  title_en: "Title EN",
  category: "Prompting",
  vibe_coder: "alice",
  vibe_coder_title_da: "Bidragyder",
  vibe_coder_title_en: "Contributor",
  rating: "4.5",
  reviews_count: 3,
  description_da: "Beskrivelse",
  description_en: "Description",
  tags: ["ai", "prompt"],
  github_url: null,
};

beforeEach(() => {
  state.publicHandler = () => ({ data: [], error: null });
  state.serverHandler = () => ({ data: null, error: null });
  state.user = null;
  state.publicCalls = [];
  state.serverCalls = [];
});

describe("mappers (language + null coalescing)", () => {
  it("selects _en columns when lang is 'en'", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    const [skill] = await db.getSkills(undefined, undefined, "en");
    expect(skill.title).toBe("Title EN");
    expect(skill.vibeCoderTitle).toBe("Contributor");
    expect(skill.description).toBe("Description");
    expect(skill.rating).toBe(4.5); // Number() coercion of "4.5"
  });

  it("selects _da columns by default", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    const [skill] = await db.getSkills();
    expect(skill.title).toBe("Titel DA");
  });

  it("coalesces null array columns to []", async () => {
    state.publicHandler = () => ({ data: [{ ...skillRow, tags: null }], error: null });
    const [skill] = await db.getSkills();
    expect(skill.tags).toEqual([]);
    expect(skill.githubUrl).toBeUndefined();
  });

  it("returns [] when the query errors", async () => {
    state.publicHandler = () => ({ data: null, error: { message: "boom" } });
    expect(await db.getSkills()).toEqual([]);
  });
});

describe("category guards and search filters", () => {
  it("getSkills applies eq('category') for a concrete category", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, "Prompting");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "category", "Prompting"]);
  });

  it("getSkills does NOT filter category for 'All'", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, "All");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters.some((f) => f[0] === "eq" && f[1] === "category")).toBe(false);
  });

  it("getAgents excludes MCP Server when no category is given", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents();
    const call = state.publicCalls.find((c) => c.table === "agents")!;
    expect(call.filters).toContainEqual(["neq", "category", "MCP Server"]);
  });

  it("getAgents includes MCP Server when explicitly requested", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents(undefined, "MCP Server");
    const call = state.publicCalls.find((c) => c.table === "agents")!;
    expect(call.filters).toContainEqual(["eq", "category", "MCP Server"]);
    expect(call.filters.some((f) => f[0] === "neq")).toBe(false);
  });

  it("getSkills search filters by title/description/tags case-insensitively", async () => {
    const rows = [
      { ...skillRow, id: "a", title_da: "Automation flow", title_en: "Automation flow" },
      { ...skillRow, id: "b", title_da: "Andet", title_en: "Other", description_da: "x", description_en: "x", tags: [] },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("AUTOMATION");
    expect(results.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("upvoteProject toggle and null-vs-0 semantics", () => {
  it("returns 0 and does not insert when unauthenticated", async () => {
    state.user = null;
    const result = await db.upvoteProject("p1");
    expect(result).toBe(0);
    expect(state.serverCalls.some((c) => c.method === "insert")).toBe(false);
  });

  it("inserts a join row on first upvote", async () => {
    state.user = { id: "u1" };
    state.serverHandler = () => ({ data: null, error: null }); // insert succeeds
    state.publicHandler = () => ({ data: { upvotes: 5 }, error: null });
    const result = await db.upvoteProject("p1");
    const insert = state.serverCalls.find((c) => c.table === "showcase_upvotes");
    expect(insert?.method).toBe("insert");
    expect(insert?.payload).toEqual({ user_id: "u1", project_id: "p1" });
    expect(result).toBe(5);
  });

  it("toggles off (deletes) on a 23505 unique violation", async () => {
    state.user = { id: "u1" };
    state.serverHandler = (ops) => {
      if (ops.method === "insert") return { data: null, error: { code: "23505" } };
      return { data: null, error: null }; // delete
    };
    state.publicHandler = () => ({ data: { upvotes: 0 }, error: null });
    const result = await db.upvoteProject("p1");
    const del = state.serverCalls.find((c) => c.method === "delete");
    expect(del?.table).toBe("showcase_upvotes");
    expect(del?.filters).toContainEqual(["eq", "user_id", "u1"]);
    expect(del?.filters).toContainEqual(["eq", "project_id", "p1"]);
    expect(result).toBe(0); // legitimate toggle-off count of 0, not null
  });

  it("returns null when the project row is missing (distinct from 0)", async () => {
    state.user = { id: "u1" };
    state.serverHandler = () => ({ data: null, error: null });
    state.publicHandler = () => ({ data: null, error: null }); // no row
    const result = await db.upvoteProject("p1");
    expect(result).toBeNull();
  });
});

describe("getThreads reply mapping", () => {
  const thread = {
    id: "t1",
    title_da: "Tråd",
    title_en: "Thread",
    author: "bob",
    category: "General",
    content_da: "Indhold",
    content_en: "Content",
    upvotes: 2,
    created_at: "2026-01-01",
  };

  it("attaches only the replies belonging to each thread", async () => {
    state.publicHandler = (ops) => {
      if (ops.table === "forum_threads") return { data: [thread], error: null };
      if (ops.table === "forum_replies")
        return {
          data: [
            { id: "r1", thread_id: "t1", author: "x", content_da: "svar", content_en: "reply", created_at: "2026-01-02" },
            { id: "r2", thread_id: "OTHER", author: "y", content_da: "nej", content_en: "no", created_at: "2026-01-03" },
          ],
          error: null,
        };
      return { data: [], error: null };
    };
    const [t] = await db.getThreads();
    expect(t.replies).toHaveLength(1);
    expect(t.replies[0].id).toBe("r1");
  });

  it("returns replies: [] for a thread with none", async () => {
    state.publicHandler = (ops) => {
      if (ops.table === "forum_threads") return { data: [thread], error: null };
      return { data: [], error: null };
    };
    const [t] = await db.getThreads();
    expect(t.replies).toEqual([]);
  });
});

describe("delete operations reflect RLS row visibility", () => {
  it("returns false when no row comes back (not owned / not found)", async () => {
    state.serverHandler = () => ({ data: [], error: null });
    expect(await db.deleteProject("p1")).toBe(false);
  });

  it("returns true when a row id is returned", async () => {
    state.serverHandler = () => ({ data: [{ id: "p1" }], error: null });
    expect(await db.deleteProject("p1")).toBe(true);
  });

  it("returns false on a delete error", async () => {
    state.serverHandler = () => ({ data: null, error: { message: "denied" } });
    expect(await db.deleteProject("p1")).toBe(false);
  });
});
