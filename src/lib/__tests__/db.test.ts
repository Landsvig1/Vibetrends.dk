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
  selectOpts?: unknown;
  payload?: unknown;
  single: boolean;
  filters: Array<[string, ...unknown[]]>;
}

type Handler = (ops: BuilderOps) => { data?: unknown; error: unknown; count?: number };

const state = vi.hoisted(() => {
  return {
    // Per-test handlers. Given the recorded ops, return { data, error }.
    publicHandler: (() => ({ data: [], error: null })) as Handler,
    serverHandler: (() => ({ data: null, error: null })) as Handler,
    user: null as { id: string } | null,
    publicCalls: [] as BuilderOps[],
    serverCalls: [] as BuilderOps[],
    // admin_bump_upvotes RPC result: null = not an admin (normal toggle path).
    rpcHandler: ((_fn: string, _args: unknown) => ({ data: null, error: null })) as (
      fn: string,
      args: unknown
    ) => { data: unknown; error: unknown },
  };
});

function makeBuilder(table: string, sink: BuilderOps[], handler: Handler) {
  const ops: BuilderOps = { table, method: "select", filters: [], single: false };
  let recorded = false;
  const record = () => {
    if (!recorded) {
      sink.push(ops);
      recorded = true;
    }
  };

  const builder: Record<string, unknown> = {
    select(cols?: string, opts?: unknown) {
      ops.select = cols;
      ops.selectOpts = opts;
      return builder;
    },
    limit(n: number) {
      ops.filters.push(["limit", n]);
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
    in(col: string, vals: unknown[]) {
      ops.filters.push(["in", col, vals]);
      return builder;
    },
    not(col: string, op: string, val: unknown) {
      ops.filters.push(["not", col, op, val]);
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
      rpc: async (fn: string, args: unknown) => state.rpcHandler(fn, args),
    }),
    getAuthUser: vi.fn(),
  };
});

import * as db from "@/lib/db";
import { skillCategoryLabel, SKILL_CATEGORY_SLUGS } from "@/lib/skillCategories";

const skillRow = {
  id: "s1",
  title_da: "Titel DA",
  title_en: "Title EN",
  category: "agent-methodology",
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
  state.rpcHandler = () => ({ data: null, error: null });
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

  it("resolves categoryLabel from the category slug, localized", async () => {
    state.publicHandler = () => ({ data: [{ ...skillRow, category: "agent-methodology" }], error: null });
    const [da] = await db.getSkills();
    expect(da.category).toBe("agent-methodology"); // canonical slug preserved
    expect(da.categoryLabel).toBe(skillCategoryLabel("agent-methodology", "da"));
    const [en] = await db.getSkills(undefined, undefined, "en");
    expect(en.categoryLabel).toBe(skillCategoryLabel("agent-methodology", "en"));
  });

  it("falls back to the raw value for an unknown/legacy category", async () => {
    state.publicHandler = () => ({ data: [{ ...skillRow, category: "Legacy" }], error: null });
    const [skill] = await db.getSkills();
    expect(skill.categoryLabel).toBe("Legacy");
  });

  it("maps source attribution when present", async () => {
    state.publicHandler = () => ({ data: [{ ...skillRow, source: "https://github.com/x/y" }], error: null });
    const [skill] = await db.getSkills();
    expect(skill.source).toBe("https://github.com/x/y");
  });
});

describe("Hot/Trending view seam (snapshot ranks)", () => {
  it("view=hot restricts to non-null hot_rank and orders by it ascending", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, undefined, "da", "hot");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["not", "hot_rank", "is", null]);
    expect(call.filters).toContainEqual(["order", "hot_rank", { ascending: true }]);
  });

  it("view=trending restricts to non-null trending_rank and orders by it ascending", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, "fullstack-devops", "da", "trending");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "category", "fullstack-devops"]);
    expect(call.filters).toContainEqual(["not", "trending_rank", "is", null]);
    expect(call.filters).toContainEqual(["order", "trending_rank", { ascending: true }]);
  });

  it("view=danish filters to is_danish=true and sorts denmark_specific first", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, undefined, "da", "danish");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "is_danish", true]);
    expect(call.filters).toContainEqual(["order", "denmark_specific", { ascending: false }]);
  });

  it("no view leaves the query unranked (no not/order filters)", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills();
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters.some((f) => f[0] === "not")).toBe(false);
    expect(call.filters.some((f) => f[0] === "order")).toBe(false);
  });

  it("view=hot combined with a category filters by both (symmetric with trending)", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, "fullstack-devops", "da", "hot");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "category", "fullstack-devops"]);
    expect(call.filters).toContainEqual(["not", "hot_rank", "is", null]);
    expect(call.filters).toContainEqual(["order", "hot_rank", { ascending: true }]);
  });

  it("search post-filters in JS on top of the view query (search + view combined)", async () => {
    const rows = [
      { ...skillRow, id: "a", title_da: "React patterns", title_en: "React patterns" },
      { ...skillRow, id: "b", title_da: "Andet", title_en: "Other", description_da: "x", description_en: "x", tags: [] },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("react", undefined, "da", "hot");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["not", "hot_rank", "is", null]); // view at query time
    expect(results.map((r) => r.id)).toEqual(["a"]); // search in JS after
  });
});

describe("parseSkillView", () => {
  it("accepts danish/hot/trending, rejects everything else", () => {
    expect(db.parseSkillView("danish")).toBe("danish");
    expect(db.parseSkillView("hot")).toBe("hot");
    expect(db.parseSkillView("trending")).toBe("trending");
    expect(db.parseSkillView("popular")).toBeUndefined();
    expect(db.parseSkillView(undefined)).toBeUndefined();
    expect(db.parseSkillView(["hot"])).toBeUndefined();
  });
});

describe("skill category taxonomy labels", () => {
  it("every SKILL_CATEGORY_SLUG resolves to non-empty da and en labels", () => {
    for (const slug of SKILL_CATEGORY_SLUGS) {
      expect(skillCategoryLabel(slug, "da")).toBeTruthy();
      expect(skillCategoryLabel(slug, "en")).toBeTruthy();
    }
  });

  it("localizes slugs whose da/en labels diverge", () => {
    expect(skillCategoryLabel("growth-content", "da")).toBe("Vækst & Indhold");
    expect(skillCategoryLabel("growth-content", "en")).toBe("Growth & Content");
    expect(skillCategoryLabel("agent-methodology", "da")).toBe("Agent-metodik");
    expect(skillCategoryLabel("agent-methodology", "en")).toBe("Agent Methodology");
  });
});

describe("category guards and search filters", () => {
  it("getSkills applies eq('category') for a concrete category", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, "agent-methodology");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "category", "agent-methodology"]);
  });

  it("getSkills does NOT filter category for 'All'", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, "All");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters.some((f) => f[0] === "eq" && f[1] === "category")).toBe(false);
  });

  it("getAgents excludes both Host and MCP Server when no category is given", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents();
    const call = state.publicCalls.find((c) => c.table === "agents")!;
    expect(call.filters).toContainEqual(["neq", "category", "Host"]);
    expect(call.filters).toContainEqual(["neq", "category", "MCP Server"]);
  });

  it("getAgents includes MCP Server when explicitly requested but still excludes Host", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents(undefined, "MCP Server");
    const call = state.publicCalls.find((c) => c.table === "agents")!;
    expect(call.filters).toContainEqual(["eq", "category", "MCP Server"]);
    // Hosts are never catalog items, so the Host guard is always applied...
    expect(call.filters).toContainEqual(["neq", "category", "Host"]);
    // ...but MCP Server is NOT excluded when explicitly requested.
    expect(call.filters.some((f) => f[0] === "neq" && f[2] === "MCP Server")).toBe(false);
  });

  it("mapAgent defaults the danish flags to false for pre-migration rows", async () => {
    state.publicHandler = () => ({
      data: [
        {
          id: "a1", name: "Tool", developer: "dev", category: "CLI",
          description_da: "d", description_en: "d", install_command: "npx tool",
          system_prompt_da: "p", system_prompt_en: "p", upvotes: 0, tags: [],
        },
        {
          id: "a2", name: "Dansk Tool", developer: "dev", category: "CLI",
          description_da: "d", description_en: "d", install_command: "npx tool",
          system_prompt_da: "p", system_prompt_en: "p", upvotes: 0, tags: [],
          is_danish: true, denmark_specific: true,
          source_url: "https://github.com/dev/tool",
        },
      ],
      error: null,
    });
    const [plain, danish] = await db.getAgents();
    expect(plain.isDanish).toBe(false);
    expect(plain.denmarkSpecific).toBe(false);
    expect(plain.sourceUrl).toBeUndefined();
    expect(danish.isDanish).toBe(true);
    expect(danish.denmarkSpecific).toBe(true);
    expect(danish.sourceUrl).toBe("https://github.com/dev/tool");
  });

  it("getAgents always excludes Host even when Host is explicitly requested (yields nothing)", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents(undefined, "Host");
    const call = state.publicCalls.find((c) => c.table === "agents")!;
    expect(call.filters).toContainEqual(["eq", "category", "Host"]);
    expect(call.filters).toContainEqual(["neq", "category", "Host"]);
  });

  it("getCli filters to the CLI category and excludes Host", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getCli();
    const call = state.publicCalls.find((c) => c.table === "agents")!;
    expect(call.filters).toContainEqual(["eq", "category", "CLI"]);
    expect(call.filters).toContainEqual(["neq", "category", "Host"]);
  });

  it("getAgentById fetches a Host row directly — the data is retained, not destroyed", async () => {
    state.publicHandler = () => ({
      data: {
        id: "h1", name: "Claude Code", developer: "Anthropic", category: "Host",
        description_da: "d", description_en: "d", install_command: "x",
        system_prompt_da: "s", system_prompt_en: "s", upvotes: 9, tags: [],
      },
      error: null,
    });
    const host = await db.getAgentById("h1");
    expect(host?.category).toBe("Host"); // retained and fetchable; route layer gates display
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
    const insert = state.serverCalls.find((c) => c.table === "vibes_upvotes");
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
    expect(del?.table).toBe("vibes_upvotes");
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

  it("admins bypass the toggle: admin_bump_upvotes result is returned, no insert", async () => {
    state.user = { id: "admin" };
    state.rpcHandler = (fn, args) => {
      expect(fn).toBe("admin_bump_upvotes");
      expect(args).toEqual({ kind: "vibe", target_id: "p1" });
      return { data: 42, error: null };
    };
    const result = await db.upvoteProject("p1");
    expect(result).toBe(42);
    expect(state.serverCalls.some((c) => c.method === "insert")).toBe(false);
  });
});

describe("upvoteThread / upvoteAgent mirror the toggle semantics on the right tables", () => {
  it("upvoteThread inserts into thread_upvotes then returns the new count", async () => {
    state.user = { id: "u1" };
    state.serverHandler = () => ({ data: null, error: null });
    state.publicHandler = () => ({ data: { upvotes: 4 }, error: null });
    const result = await db.upvoteThread("t1");
    const insert = state.serverCalls.find((c) => c.table === "thread_upvotes");
    expect(insert?.method).toBe("insert");
    expect(insert?.payload).toEqual({ user_id: "u1", thread_id: "t1" });
    expect(result).toBe(4);
  });

  it("upvoteThread toggles off on 23505 via a delete keyed by thread_id", async () => {
    state.user = { id: "u1" };
    state.serverHandler = (ops) =>
      ops.method === "insert" ? { data: null, error: { code: "23505" } } : { data: null, error: null };
    state.publicHandler = () => ({ data: { upvotes: 0 }, error: null });
    const result = await db.upvoteThread("t1");
    const del = state.serverCalls.find((c) => c.method === "delete");
    expect(del?.table).toBe("thread_upvotes");
    expect(del?.filters).toContainEqual(["eq", "thread_id", "t1"]);
    expect(result).toBe(0);
  });

  it("upvoteThread returns 0 and does not insert when unauthenticated", async () => {
    state.user = null;
    expect(await db.upvoteThread("t1")).toBe(0);
    expect(state.serverCalls.some((c) => c.method === "insert")).toBe(false);
  });

  it("upvoteAgent inserts into agent_upvotes keyed by agent_id", async () => {
    state.user = { id: "u1" };
    state.serverHandler = () => ({ data: null, error: null });
    state.publicHandler = () => ({ data: { upvotes: 7 }, error: null });
    const result = await db.upvoteAgent("a1");
    const insert = state.serverCalls.find((c) => c.table === "agent_upvotes");
    expect(insert?.payload).toEqual({ user_id: "u1", agent_id: "a1" });
    expect(result).toBe(7);
  });

  it("upvoteAgent toggles off on 23505 via a delete keyed by agent_id", async () => {
    state.user = { id: "u1" };
    state.serverHandler = (ops) =>
      ops.method === "insert" ? { data: null, error: { code: "23505" } } : { data: null, error: null };
    state.publicHandler = () => ({ data: { upvotes: 0 }, error: null });
    await db.upvoteAgent("a1");
    const del = state.serverCalls.find((c) => c.method === "delete");
    expect(del?.table).toBe("agent_upvotes");
    expect(del?.filters).toContainEqual(["eq", "agent_id", "a1"]);
  });

  it("upvoteAgent returns null when the agent row is missing", async () => {
    state.user = { id: "u1" };
    state.serverHandler = () => ({ data: null, error: null });
    state.publicHandler = () => ({ data: null, error: null });
    expect(await db.upvoteAgent("a1")).toBeNull();
  });

  it("upvoteReply inserts into reply_upvotes keyed by reply_id and returns the count", async () => {
    state.user = { id: "u1" };
    state.serverHandler = () => ({ data: null, error: null });
    state.publicHandler = () => ({ data: { upvotes: 2 }, error: null });
    const result = await db.upvoteReply("r1");
    const insert = state.serverCalls.find((c) => c.table === "reply_upvotes");
    expect(insert?.method).toBe("insert");
    expect(insert?.payload).toEqual({ user_id: "u1", reply_id: "r1" });
    expect(result).toBe(2);
  });

  it("upvoteReply toggles off on 23505 via a delete keyed by reply_id", async () => {
    state.user = { id: "u1" };
    state.serverHandler = (ops) =>
      ops.method === "insert" ? { data: null, error: { code: "23505" } } : { data: null, error: null };
    state.publicHandler = () => ({ data: { upvotes: 0 }, error: null });
    const result = await db.upvoteReply("r1");
    const del = state.serverCalls.find((c) => c.method === "delete");
    expect(del?.table).toBe("reply_upvotes");
    expect(del?.filters).toContainEqual(["eq", "reply_id", "r1"]);
    expect(result).toBe(0);
  });

  it("upvoteReply returns 0 and does not insert when unauthenticated", async () => {
    state.user = null;
    expect(await db.upvoteReply("r1")).toBe(0);
    expect(state.serverCalls.some((c) => c.method === "insert")).toBe(false);
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

  it("scopes the reply fetch to the returned thread ids (no full-table scan)", async () => {
    state.publicHandler = (ops) => {
      if (ops.table === "forum_threads")
        return { data: [thread, { ...thread, id: "t2" }], error: null };
      return { data: [], error: null };
    };
    await db.getThreads();
    const replyCall = state.publicCalls.find((c) => c.table === "forum_replies")!;
    expect(replyCall.filters).toContainEqual(["in", "thread_id", ["t1", "t2"]]);
  });

  it("does not query replies at all when there are no threads", async () => {
    state.publicHandler = (ops) => {
      if (ops.table === "forum_threads") return { data: [], error: null };
      return { data: [], error: null };
    };
    expect(await db.getThreads()).toEqual([]);
    expect(state.publicCalls.some((c) => c.table === "forum_replies")).toBe(false);
  });

  it("defaults to ordering threads by upvotes desc (Top)", async () => {
    state.publicHandler = (ops) =>
      ops.table === "forum_threads" ? { data: [thread], error: null } : { data: [], error: null };
    await db.getThreads();
    const call = state.publicCalls.find((c) => c.table === "forum_threads")!;
    expect(call.filters).toContainEqual(["order", "upvotes", { ascending: false }]);
  });

  it("orders threads by created_at desc when sort is 'new'", async () => {
    state.publicHandler = (ops) =>
      ops.table === "forum_threads" ? { data: [thread], error: null } : { data: [], error: null };
    await db.getThreads(undefined, "da", undefined, "new");
    const call = state.publicCalls.find((c) => c.table === "forum_threads")!;
    expect(call.filters).toContainEqual(["order", "created_at", { ascending: false }]);
  });
});

describe("getProjects sort", () => {
  it("defaults to ordering vibes by created_at desc (Newest)", async () => {
    state.publicHandler = (ops) =>
      ops.table === "vibes" ? { data: [], error: null } : { data: [], error: null };
    await db.getProjects();
    const call = state.publicCalls.find((c) => c.table === "vibes")!;
    expect(call.filters).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("orders by upvotes desc when sort is 'top'", async () => {
    state.publicHandler = (ops) =>
      ops.table === "vibes" ? { data: [], error: null } : { data: [], error: null };
    await db.getProjects(undefined, "da", "top");
    const call = state.publicCalls.find((c) => c.table === "vibes")!;
    expect(call.filters).toContainEqual(["order", "upvotes", { ascending: false }]);
  });

  it("orders by title_da asc when sort is 'az' and lang is 'da'", async () => {
    state.publicHandler = (ops) =>
      ops.table === "vibes" ? { data: [], error: null } : { data: [], error: null };
    await db.getProjects(undefined, "da", "az");
    const call = state.publicCalls.find((c) => c.table === "vibes")!;
    expect(call.filters).toContainEqual(["order", "title_da", { ascending: true }]);
  });

  it("orders by title_en asc when sort is 'az' and lang is 'en'", async () => {
    state.publicHandler = (ops) =>
      ops.table === "vibes" ? { data: [], error: null } : { data: [], error: null };
    await db.getProjects(undefined, "en", "az");
    const call = state.publicCalls.find((c) => c.table === "vibes")!;
    expect(call.filters).toContainEqual(["order", "title_en", { ascending: true }]);
  });
});

describe("homepage-optimized reads", () => {
  it("getCounts requests head-only exact counts and excludes MCP agents", async () => {
    state.publicHandler = (ops) => {
      const counts: Record<string, number> = {
        skills: 3,
        vibes: 5,
        forum_threads: 7,
        agents: 9,
      };
      return { count: counts[ops.table] ?? 0, error: null };
    };
    const counts = await db.getCounts();
    expect(counts).toEqual({ skills: 3, vibes: 5, threads: 7, agents: 9 });

    const skillsCall = state.publicCalls.find((c) => c.table === "skills")!;
    expect(skillsCall.selectOpts).toEqual({ count: "exact", head: true });
    const agentsCall = state.publicCalls.find((c) => c.table === "agents")!;
    expect(agentsCall.filters).toContainEqual(["neq", "category", "MCP Server"]);
    expect(agentsCall.filters).toContainEqual(["neq", "category", "Host"]);
  });

  it("getTopProjects orders by upvotes desc and limits", async () => {
    state.publicHandler = () => ({
      data: [{ id: "p1", title_da: "P", title_en: "P", author: "a", description_da: "d", description_en: "d", tools: null, prompts: null, upvotes: 9, demo_url: null, github_url: null, image_url: null }],
      error: null,
    });
    const res = await db.getTopProjects(1, "da");
    expect(res).toHaveLength(1);
    const call = state.publicCalls.find((c) => c.table === "vibes")!;
    expect(call.filters).toContainEqual(["order", "upvotes", { ascending: false }]);
    expect(call.filters).toContainEqual(["limit", 1]);
  });

  it("getTopAgents excludes MCP servers and hosts and limits", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getTopAgents(1);
    const call = state.publicCalls.find((c) => c.table === "agents")!;
    expect(call.filters).toContainEqual(["neq", "category", "MCP Server"]);
    expect(call.filters).toContainEqual(["neq", "category", "Host"]);
    expect(call.filters).toContainEqual(["limit", 1]);
  });

  it("getTopSkills features danish skills, denmark-specific first, and limits", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    const res = await db.getTopSkills(1, "da");
    expect(res).toHaveLength(1);
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "is_danish", true]);
    expect(call.filters).toContainEqual(["order", "denmark_specific", { ascending: false }]);
    expect(call.filters).toContainEqual(["limit", 1]);
  });

  it("getLatestPosts orders by published_at desc and limits", async () => {
    state.publicHandler = () => ({
      data: [{ id: "b1", title_da: "T", title_en: "T", excerpt_da: "e", excerpt_en: "e", content_da: "c", content_en: "c", author: "a", read_time: "2 min", published_at: "2026-01-01", image_url: "/x.jpg", category: "Guides" }],
      error: null,
    });
    const res = await db.getLatestPosts(1, "da");
    expect(res).toHaveLength(1);
    const call = state.publicCalls.find((c) => c.table === "blog_posts")!;
    expect(call.filters).toContainEqual(["order", "published_at", { ascending: false }]);
    expect(call.filters).toContainEqual(["limit", 1]);
  });

  it("getThreads applies a limit when one is given", async () => {
    state.publicHandler = (ops) =>
      ops.table === "forum_threads"
        ? { data: [{ id: "t1", title_da: "T", title_en: "T", author: "a", category: "General", content_da: "c", content_en: "c", upvotes: 1, created_at: "2026-01-01" }], error: null }
        : { data: [], error: null };
    await db.getThreads(undefined, "da", 2);
    const call = state.publicCalls.find((c) => c.table === "forum_threads")!;
    expect(call.filters).toContainEqual(["limit", 2]);
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
