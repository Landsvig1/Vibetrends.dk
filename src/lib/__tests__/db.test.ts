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
  /** Raw filter strings passed to .or() — used to assert SQL-side search narrowing. */
  orClauses: string[];
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
    rpcHandler: (() => ({ data: null, error: null })) as (
      fn: string,
      args: unknown
    ) => { data: unknown; error: unknown },
    // U2 — tracks calls to next/cache functions for tag-scheme verification.
    cacheTagCalls: [] as string[][],
    cacheLifeCalls: [] as string[],
    revalidateTagCalls: [] as Array<string[]>,
  };
});

function makeBuilder(table: string, sink: BuilderOps[], handler: Handler) {
  const ops: BuilderOps = { table, method: "select", filters: [], single: false, orClauses: [] };
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
    or(filter: string) {
      ops.orClauses.push(filter);
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

// Mock next/cache so the "use cache" directive and cacheTag/cacheLife/revalidateTag
// calls in db.ts are captured without requiring a real Next.js runtime. In Vitest,
// the "use cache" string directive has no effect (it's just a no-op expression), so
// functions execute normally — we can only verify the tag *calls*, not actual cache
// hit/miss behavior, which requires the real Next.js runtime.
vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]) => { state.cacheTagCalls.push(tags); },
  cacheLife: (profile: string) => { state.cacheLifeCalls.push(profile); },
  revalidateTag: (...args: string[]) => { state.revalidateTagCalls.push(args); },
}));

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
import { sanitizeSearchTerm } from "@/lib/db";
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
  state.cacheTagCalls = [];
  state.cacheLifeCalls = [];
  state.revalidateTagCalls = [];
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

  it("view=danish filters to is_danish=true, sorts denmark_specific first then upvotes", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills(undefined, undefined, "da", "danish");
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "is_danish", true]);
    const orders = call.filters.filter((f) => f[0] === "order");
    expect(orders).toEqual([
      ["order", "denmark_specific", { ascending: false }],
      ["order", "upvotes", { ascending: false }],
    ]);
  });

  it("no view ranks the full catalog by upvotes (no snapshot-rank filters)", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills();
    const call = state.publicCalls.find((c) => c.table === "skills")!;
    expect(call.filters.some((f) => f[0] === "not")).toBe(false);
    expect(call.filters.filter((f) => f[0] === "order")).toEqual([
      ["order", "upvotes", { ascending: false }],
    ]);
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

describe("upvoteProject — U8 toggle_upvote RPC single round-trip", () => {
  it("returns 0 and does not call toggle_upvote RPC when unauthenticated", async () => {
    state.user = null;
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => { rpcCalls.push({ fn, args }); return { data: null, error: null }; };
    const result = await db.upvoteProject("p1");
    expect(result).toBe(0);
    expect(rpcCalls.some(c => c.fn === "toggle_upvote")).toBe(false);
  });

  it("calls toggle_upvote RPC with kind='vibe' and target_id on first upvote", async () => {
    state.user = { id: "u1" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => {
      rpcCalls.push({ fn, args });
      if (fn === "admin_bump_upvotes") return { data: null, error: null }; // not admin
      return { data: 5, error: null }; // toggle_upvote returns new count
    };
    const result = await db.upvoteProject("p1");
    const toggleCall = rpcCalls.find(c => c.fn === "toggle_upvote");
    expect(toggleCall).toBeDefined();
    expect(toggleCall!.args).toEqual({ kind: "vibe", target_id: "p1" });
    expect(result).toBe(5);
  });

  it("uses the RPC count directly — no secondary SELECT on the parent table", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: 7, error: null };
    };
    await db.upvoteProject("p1");
    // No SELECT on 'vibes' for upvotes — count came from RPC.
    const vibesSelect = state.publicCalls.find(c => c.table === "vibes" && c.select === "upvotes");
    expect(vibesSelect).toBeUndefined();
  });

  it("toggle-off (second vote) calls the RPC once and returns the decremented count — no client arithmetic", async () => {
    state.user = { id: "u1" };
    // The RPC handles toggle internally; it returns the authoritative post-delete count.
    let toggleCallCount = 0;
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      toggleCallCount++;
      return { data: 0, error: null }; // authoritative decremented count from RPC
    };
    const result = await db.upvoteProject("p1");
    expect(toggleCallCount).toBe(1); // single round-trip, not 2 or 3
    expect(result).toBe(0); // authoritative count — not client-computed "pre-delete value minus one"
  });

  it("returns null when toggle_upvote RPC returns null (entity not found)", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: null }; // entity not found → null
    };
    const result = await db.upvoteProject("p1");
    expect(result).toBeNull();
  });

  it("returns 'rpc_error' and does not call revalidateTag when toggle_upvote RPC transport fails", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: { message: "RPC failed", code: "500" } };
    };
    const result = await db.upvoteProject("p1");
    expect(result).toBe('rpc_error');
    // No cache invalidation should occur when the RPC failed — avoids
    // triggering a re-fetch on an incomplete/inconsistent state.
    expect(state.revalidateTagCalls.length).toBe(0);
  });

  it("returns null (not 'rpc_error') when toggle_upvote RPC succeeds but returns null — entity not found", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: null }; // no rpcError, data is null → not found
    };
    const result = await db.upvoteProject("p1");
    expect(result).toBeNull(); // null = entity not found, NOT a transport error
  });

  it("admins bypass toggle_upvote: admin_bump_upvotes result is returned directly", async () => {
    state.user = { id: "admin" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => {
      rpcCalls.push({ fn, args });
      if (fn === "admin_bump_upvotes") return { data: 42, error: null };
      return { data: 0, error: null };
    };
    const result = await db.upvoteProject("p1");
    expect(result).toBe(42);
    // admin_bump_upvotes was called; toggle_upvote was NOT called.
    expect(rpcCalls.some(c => c.fn === "admin_bump_upvotes")).toBe(true);
    expect(rpcCalls.some(c => c.fn === "toggle_upvote")).toBe(false);
  });
});

describe("upvoteThread / upvoteSkill / upvoteAgent / upvoteReply — U8 toggle_upvote RPC", () => {
  // Helper to build an rpcHandler that returns null for admin_bump_upvotes
  // (not admin) and the given count for toggle_upvote.
  function makeToggleHandler(count: number) {
    return (fn: string) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: count, error: null };
    };
  }

  it("upvoteThread calls toggle_upvote RPC with kind='thread' and returns the authoritative count", async () => {
    state.user = { id: "u1" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => { rpcCalls.push({ fn, args }); return makeToggleHandler(4)(fn); };
    const result = await db.upvoteThread("t1");
    const toggleCall = rpcCalls.find(c => c.fn === "toggle_upvote");
    expect(toggleCall).toBeDefined();
    expect(toggleCall!.args).toEqual({ kind: "thread", target_id: "t1" });
    expect(result).toBe(4);
    // No secondary SELECT on forum_threads for upvotes.
    expect(state.publicCalls.some(c => c.table === "forum_threads" && c.select === "upvotes")).toBe(false);
  });

  it("upvoteThread returns 0 and does not call toggle_upvote when unauthenticated", async () => {
    state.user = null;
    const rpcCalls: Array<string> = [];
    state.rpcHandler = (fn) => { rpcCalls.push(fn); return { data: null, error: null }; };
    expect(await db.upvoteThread("t1")).toBe(0);
    expect(rpcCalls.includes("toggle_upvote")).toBe(false);
  });

  it("upvoteSkill calls toggle_upvote RPC with kind='skill' and returns the authoritative count", async () => {
    state.user = { id: "u1" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => { rpcCalls.push({ fn, args }); return makeToggleHandler(3)(fn); };
    const result = await db.upvoteSkill("s1");
    const toggleCall = rpcCalls.find(c => c.fn === "toggle_upvote");
    expect(toggleCall).toBeDefined();
    expect(toggleCall!.args).toEqual({ kind: "skill", target_id: "s1" });
    expect(result).toBe(3);
  });

  it("upvoteSkill routes admins through admin_bump_upvotes with kind 'skill'", async () => {
    state.user = { id: "admin" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => {
      rpcCalls.push({ fn, args });
      if (fn === "admin_bump_upvotes") return { data: 9, error: null };
      return { data: 0, error: null };
    };
    const result = await db.upvoteSkill("s1");
    expect(result).toBe(9);
    expect(rpcCalls.some(c => c.fn === "admin_bump_upvotes" && (c.args as Record<string, string>).kind === "skill")).toBe(true);
    expect(rpcCalls.some(c => c.fn === "toggle_upvote")).toBe(false);
  });

  it("upvoteAgent calls toggle_upvote RPC with kind='agent' and returns the authoritative count", async () => {
    state.user = { id: "u1" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => { rpcCalls.push({ fn, args }); return makeToggleHandler(7)(fn); };
    const result = await db.upvoteAgent("a1");
    const toggleCall = rpcCalls.find(c => c.fn === "toggle_upvote");
    expect(toggleCall).toBeDefined();
    expect(toggleCall!.args).toEqual({ kind: "agent", target_id: "a1" });
    expect(result).toBe(7);
    // No secondary SELECT on agents table for upvotes.
    expect(state.publicCalls.some(c => c.table === "agents" && c.select === "upvotes")).toBe(false);
  });

  it("upvoteAgent returns null when toggle_upvote RPC returns null (entity not found)", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: null };
    };
    expect(await db.upvoteAgent("a1")).toBeNull();
  });

  it("upvoteReply calls toggle_upvote RPC with kind='reply' and returns the count from RPC (not from a re-select)", async () => {
    state.user = { id: "u1" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => { rpcCalls.push({ fn, args }); return makeToggleHandler(2)(fn); };
    // publicHandler returns thread_id for the secondary SELECT (needed for cache tag)
    state.publicHandler = () => ({ data: { thread_id: "t99" }, error: null });
    const result = await db.upvoteReply("r1");
    const toggleCall = rpcCalls.find(c => c.fn === "toggle_upvote");
    expect(toggleCall).toBeDefined();
    expect(toggleCall!.args).toEqual({ kind: "reply", target_id: "r1" });
    expect(result).toBe(2);
    // The secondary SELECT is for thread_id only — NOT for upvotes.
    const replySelect = state.publicCalls.find(c => c.table === "forum_replies");
    // If a SELECT was made, it must not have been asking for upvotes count (that came from RPC).
    if (replySelect) {
      expect(replySelect.select).not.toBe("upvotes");
    }
  });

  it("upvoteReply returns 0 and does not call toggle_upvote when unauthenticated", async () => {
    state.user = null;
    const rpcCalls: Array<string> = [];
    state.rpcHandler = (fn) => { rpcCalls.push(fn); return { data: null, error: null }; };
    expect(await db.upvoteReply("r1")).toBe(0);
    expect(rpcCalls.includes("toggle_upvote")).toBe(false);
  });

  it("admin upvoteReply without threadId still invalidates thread-{id} (hoisted lookup covers admin branch)", async () => {
    // Regression guard for the hoist fix: previously the admin branch used a
    // bare `if (threadId)` guard, so it would skip the specific-thread cache
    // invalidation when threadId was omitted. After hoisting the lookup above
    // both branches, resolvedThreadId is always set (from the lookup when the
    // caller doesn't supply threadId), so the admin path invalidates both tags.
    state.user = { id: "admin" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: 10, error: null };
      return { data: 0, error: null };
    };
    // Simulate the DB lookup returning the parent thread id.
    state.publicHandler = () => ({ data: { thread_id: "t42" }, error: null });
    const result = await db.upvoteReply("r1"); // no threadId argument
    expect(result).toBe(10);
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain("threads-list");
    expect(tags).toContain("thread-t42"); // must appear even though threadId was not passed
  });

  it("failed toggle_upvote RPC returns 'rpc_error' (not null) without calling revalidateTag (no partial state)", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: { message: "DB error", code: "500" } };
    };
    const result = await db.upvoteAgent("a1");
    expect(result).toBe('rpc_error');
    // revalidateTag must NOT fire when the RPC failed — no partial/inconsistent state.
    expect(state.revalidateTagCalls.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // RPC transport error vs entity-not-found distinction (all five upvote paths)
  // ---------------------------------------------------------------------------
  // Each upvote function must distinguish:
  //   rpcError set → 'rpc_error' sentinel (transport failure, retryable, → 503)
  //   rpcData null, no rpcError → null (entity not found per RPC contract, → 404)
  // ---------------------------------------------------------------------------
  it("upvoteSkill returns 'rpc_error' on transport failure, null on entity not found", async () => {
    state.user = { id: "u1" };
    // Transport failure
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: { message: "network error" } };
    };
    expect(await db.upvoteSkill("s1")).toBe('rpc_error');
    // Entity not found
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: null };
    };
    expect(await db.upvoteSkill("s1")).toBeNull();
  });

  it("upvoteThread returns 'rpc_error' on transport failure, null on entity not found", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: { message: "network error" } };
    };
    expect(await db.upvoteThread("t1")).toBe('rpc_error');
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: null };
    };
    expect(await db.upvoteThread("t1")).toBeNull();
  });

  it("upvoteReply returns 'rpc_error' on transport failure, null on entity not found", async () => {
    state.user = { id: "u1" };
    state.publicHandler = () => ({ data: { thread_id: "t1" }, error: null });
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: { message: "network error" } };
    };
    expect(await db.upvoteReply("r1", "t1")).toBe('rpc_error');
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: null };
    };
    expect(await db.upvoteReply("r1", "t1")).toBeNull();
  });

  it("'rpc_error' paths do not call revalidateTag (no partial-state invalidation on 5xx)", async () => {
    state.user = { id: "u1" };
    const transportError = { message: "ECONNRESET" };
    state.rpcHandler = (fn) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null };
      return { data: null, error: transportError };
    };
    await db.upvoteSkill("s1");
    await db.upvoteProject("p1");
    await db.upvoteThread("t1");
    await db.upvoteAgent("a1");
    state.publicHandler = () => ({ data: { thread_id: "t1" }, error: null });
    await db.upvoteReply("r1", "t1");
    // None of the five transport-error paths should have called revalidateTag.
    expect(state.revalidateTagCalls.length).toBe(0);
  });

  it("admin multi-upvote path (adminBumpUpvotes) is unaffected by U8 — still returns count directly", async () => {
    // Verify admin_bump_upvotes RPC is still called (not replaced by toggle_upvote)
    // for admin users across all entity types. U8 only changes the non-admin path.
    state.user = { id: "admin" };
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];
    state.rpcHandler = (fn, args) => {
      rpcCalls.push({ fn, args });
      if (fn === "admin_bump_upvotes") return { data: 99, error: null };
      return { data: 0, error: null };
    };

    // Thread
    rpcCalls.length = 0;
    expect(await db.upvoteThread("t1")).toBe(99);
    expect(rpcCalls.some(c => c.fn === "admin_bump_upvotes" && (c.args as Record<string, string>).kind === "thread")).toBe(true);
    expect(rpcCalls.some(c => c.fn === "toggle_upvote")).toBe(false);

    // Agent
    rpcCalls.length = 0;
    expect(await db.upvoteAgent("a1")).toBe(99);
    expect(rpcCalls.some(c => c.fn === "admin_bump_upvotes" && (c.args as Record<string, string>).kind === "agent")).toBe(true);
    expect(rpcCalls.some(c => c.fn === "toggle_upvote")).toBe(false);
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
    await db.getThreads({ lang: "da", sort: "new" });
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
    await db.getThreads({ lang: "da", limit: 2 });
    const call = state.publicCalls.find((c) => c.table === "forum_threads")!;
    expect(call.filters).toContainEqual(["limit", 2]);
  });
});

// ---------------------------------------------------------------------------
// U1 — SQL-push search and bounded list queries
// ---------------------------------------------------------------------------

describe("sanitizeSearchTerm (KTD3 injection resistance)", () => {
  it("strips PostgREST grammar chars: , . ( ) *", () => {
    // Input: x),category.eq.Hidden,title_da.ilike.%(
    // Strips: )  ,           .  .        ,        .  %(
    // Also strips _ (SQL LIKE wildcard), so title_da loses the underscore
    expect(sanitizeSearchTerm("x),category.eq.Hidden,title_da.ilike.%(")).toBe(
      "xcategoryeqHiddentitledailike"
    );
  });

  it("strips SQL LIKE wildcards: % _", () => {
    expect(sanitizeSearchTerm("100%_test")).toBe("100test");
  });

  it("leaves ordinary alphanumeric and hyphen characters untouched", () => {
    expect(sanitizeSearchTerm("vibe-coding")).toBe("vibe-coding");
    expect(sanitizeSearchTerm("react")).toBe("react");
    expect(sanitizeSearchTerm("Next JS")).toBe("Next JS");
  });

  it("returns empty string when the entire input is stripped", () => {
    expect(sanitizeSearchTerm(",.()")).toBe("");
  });
});

const agentRow = {
  id: "a1",
  name: "CoolAgent",
  developer: "dev",
  category: "CLI",
  description_da: "Dansk beskrivelse",
  description_en: "English description",
  install_command: "npx cool",
  system_prompt_da: "p",
  system_prompt_en: "p",
  upvotes: 0,
  tags: ["vibe-coding", "ai"],
};

const showcaseRow = {
  id: "p1",
  title_da: "Dansk titel",
  title_en: "English title",
  author: "alice",
  description_da: "Dansk beskrivelse",
  description_en: "English description",
  tools: ["cursor", "claude"],
  prompts: null,
  upvotes: 5,
  demo_url: "https://example.com",
  github_url: null,
  image_url: null,
  created_at: "2026-01-01",
};

describe("U1 — getSkills search (bilingual, tag substring)", () => {
  it("matches on title_da (active language irrelevant — both columns checked)", async () => {
    const rows = [
      { ...skillRow, id: "a", title_da: "Automation flow", title_en: "Something else" },
      { ...skillRow, id: "b", title_da: "Urelated", title_en: "Unrelated" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("automati");
    expect(results.map(r => r.id)).toEqual(["a"]);
  });

  it("matches on title_en even when lang is 'da'", async () => {
    const rows = [
      { ...skillRow, id: "a", title_da: "Irrelevant", title_en: "React Patterns" },
      { ...skillRow, id: "b", title_da: "Irrelevant", title_en: "Vue Patterns" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    // lang='da' but search must still check title_en
    const results = await db.getSkills("react", undefined, "da");
    expect(results.map(r => r.id)).toEqual(["a"]);
  });

  it("matches on description_da", async () => {
    const rows = [
      { ...skillRow, id: "a", description_da: "Automation pipeline", description_en: "x" },
      { ...skillRow, id: "b", description_da: "Nothing", description_en: "x" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("pipeline");
    expect(results.map(r => r.id)).toEqual(["a"]);
  });

  it("matches on description_en even when lang is 'da'", async () => {
    const rows = [
      { ...skillRow, id: "a", description_da: "x", description_en: "Workflow automation" },
      { ...skillRow, id: "b", description_da: "x", description_en: "Nothing" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("workflow", undefined, "da");
    expect(results.map(r => r.id)).toEqual(["a"]);
  });

  it("matches via tag substring — 'code' matches tag 'no-code' (substring, not exact element)", async () => {
    // "no-code".includes("code") === true — substring match within array element.
    // This verifies we do NOT use PostgREST's .contains()/.overlaps() (exact-element
    // match only), and that pure tag-only items (no match in title/description) are found.
    const rows = [
      {
        ...skillRow,
        id: "a",
        title_da: "AI Assistent",
        title_en: "AI Assistant",
        description_da: "Hjælper dig",
        description_en: "Helps you",
        tags: ["no-code", "automation"],
      },
      {
        ...skillRow,
        id: "b",
        title_da: "Noget andet",
        title_en: "Something else",
        description_da: "x",
        description_en: "x",
        tags: ["productivity"],
      },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("code");
    expect(results.map(r => r.id)).toEqual(["a"]);
  });

  it("SQL .or() clause is sent to the query builder when a search term is given", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills("react");
    const call = state.publicCalls.find(c => c.table === "skills")!;
    expect(call.orClauses).toHaveLength(1);
    const clause = call.orClauses[0];
    // All title/description columns (both languages) must be in the SQL clause.
    expect(clause).toContain("title_da.ilike.%react%");
    expect(clause).toContain("title_en.ilike.%react%");
    expect(clause).toContain("description_da.ilike.%react%");
    expect(clause).toContain("description_en.ilike.%react%");
    // tags::text cast covers array element substring matching at SQL level.
    expect(clause).toContain("tags::text.ilike.%react%");
  });

  it("no SQL .or() clause is added when the search term is empty or all-stripped", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getSkills("");
    const callEmpty = state.publicCalls.find(c => c.table === "skills")!;
    expect(callEmpty.orClauses).toHaveLength(0);

    state.publicCalls = [];
    state.publicHandler = () => ({ data: [], error: null });
    await db.getSkills(",.*");  // strips to empty — treated as no search
    const callStripped = state.publicCalls.find(c => c.table === "skills")!;
    expect(callStripped.orClauses).toHaveLength(0);
  });

  it("injection term is sanitized before embedding in the SQL .or() clause", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getSkills("x),category.eq.Hidden,title_da.ilike.%(");
    const call = state.publicCalls.find(c => c.table === "skills")!;
    expect(call.orClauses).toHaveLength(1);
    const clause = call.orClauses[0];
    // Dangerous chars stripped — the embedded term is the sanitized literal only.
    expect(clause).not.toContain("),");
    expect(clause).not.toContain("category.eq");
    // The sanitized + lowercased term is embedded safely (lowercase because the
    // db function calls .toLowerCase() on the sanitized output before building
    // the filter string).
    expect(clause).toContain("xcategoryeqhiddentitledailike");
  });

  it("search is case-insensitive", async () => {
    const rows = [{ ...skillRow, id: "a", title_da: "REACT hooks", title_en: "REACT hooks" }];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getSkills("react")).map(r => r.id)).toEqual(["a"]);
    expect((await db.getSkills("REACT")).map(r => r.id)).toEqual(["a"]);
    expect((await db.getSkills("React")).map(r => r.id)).toEqual(["a"]);
  });

  it("empty search returns all rows unchanged", async () => {
    const rows = [
      { ...skillRow, id: "a" },
      { ...skillRow, id: "b" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("");
    expect(results.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("undefined search returns all rows unchanged", async () => {
    const rows = [{ ...skillRow, id: "a" }, { ...skillRow, id: "b" }];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills(undefined);
    expect(results.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("category + search narrows on both dimensions", async () => {
    const rows = [
      { ...skillRow, id: "a", category: "agent-methodology", title_da: "Agent flow", title_en: "Agent flow" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("agent", "agent-methodology");
    const call = state.publicCalls.find(c => c.table === "skills")!;
    expect(call.filters).toContainEqual(["eq", "category", "agent-methodology"]);
    expect(results.map(r => r.id)).toEqual(["a"]);
  });

  it("search term with zero matches returns []", async () => {
    const rows = [{ ...skillRow, id: "a", title_da: "Python", title_en: "Python", tags: [] }];
    state.publicHandler = () => ({ data: rows, error: null });
    expect(await db.getSkills("xyzzy-no-match-99")).toEqual([]);
  });

  it("injection string is sanitized — does not widen the result set", async () => {
    // Injection attempt: 'x),category.eq.Hidden,title_da.ilike.%('
    // After sanitizeSearchTerm this becomes 'xcategoryeqHiddentitle_dailike' —
    // a literal string unlikely to match any real skill, and definitely not
    // capable of redefining filter structure.
    const rows = [
      { ...skillRow, id: "a", title_da: "Normal skill", title_en: "Normal skill", tags: [] },
      { ...skillRow, id: "b", title_da: "Hidden skill", title_en: "Hidden skill", tags: [] },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getSkills("x),category.eq.Hidden,title_da.ilike.%(");
    // Sanitized term "xcategoryeqHiddentitle_dailike" matches nothing → []
    expect(results).toEqual([]);
  });

  it("a search term whose dangerous chars are the entire input returns all rows (term stripped to empty)", async () => {
    const rows = [{ ...skillRow, id: "a" }, { ...skillRow, id: "b" }];
    state.publicHandler = () => ({ data: rows, error: null });
    // ',.*' sanitizes to '' — treated as no search
    const results = await db.getSkills(",.*");
    expect(results.map(r => r.id)).toEqual(["a", "b"]);
  });
});

describe("U1 — getProjects search (bilingual, tools substring)", () => {
  it("matches on title_da and title_en regardless of lang", async () => {
    const rows = [
      // Override description columns too so only the title columns drive the match.
      { ...showcaseRow, id: "a", title_da: "Dansk projekt", title_en: "English project", description_da: "x", description_en: "x", tools: [] },
      { ...showcaseRow, id: "b", title_da: "Noget andet", title_en: "Something else", description_da: "x", description_en: "x", tools: [] },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    // Searching 'dansk' hits title_da
    expect((await db.getProjects("dansk")).map(r => r.id)).toEqual(["a"]);
    state.publicCalls = [];
    state.publicHandler = () => ({ data: rows, error: null });
    // Searching 'english' hits title_en even with lang='da'
    expect((await db.getProjects("english", "da")).map(r => r.id)).toEqual(["a"]);
  });

  it("matches on description_da and description_en", async () => {
    const rows = [
      { ...showcaseRow, id: "a", description_da: "Workflow automation", description_en: "x" },
      { ...showcaseRow, id: "b", description_da: "x", description_en: "x" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getProjects("workflow")).map(r => r.id)).toEqual(["a"]);
  });

  it("matches via tools substring — 'curs' matches tool 'cursor'", async () => {
    const rows = [
      {
        ...showcaseRow,
        id: "a",
        title_da: "Irrelevant",
        title_en: "Irrelevant",
        description_da: "x",
        description_en: "x",
        tools: ["cursor", "claude"],
      },
      { ...showcaseRow, id: "b", tools: ["python"] },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getProjects("curs")).map(r => r.id)).toEqual(["a"]);
  });

  it("SQL .or() clause is sent to the query builder when a search term is given", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getProjects("cursor");
    const call = state.publicCalls.find(c => c.table === "vibes")!;
    expect(call.orClauses).toHaveLength(1);
    const clause = call.orClauses[0];
    expect(clause).toContain("title_da.ilike.%cursor%");
    expect(clause).toContain("title_en.ilike.%cursor%");
    expect(clause).toContain("description_da.ilike.%cursor%");
    expect(clause).toContain("description_en.ilike.%cursor%");
    // tools::text cast covers array element substring matching at SQL level.
    expect(clause).toContain("tools::text.ilike.%cursor%");
  });

  it("no SQL .or() clause is added when the search term is empty", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getProjects("");
    const call = state.publicCalls.find(c => c.table === "vibes")!;
    expect(call.orClauses).toHaveLength(0);
  });

  it("empty search returns all rows", async () => {
    const rows = [{ ...showcaseRow, id: "a" }, { ...showcaseRow, id: "b" }];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getProjects("")).map(r => r.id)).toEqual(["a", "b"]);
  });

  it("zero-match search returns []", async () => {
    const rows = [{ ...showcaseRow, id: "a" }];
    state.publicHandler = () => ({ data: rows, error: null });
    expect(await db.getProjects("xyzzy-no-match")).toEqual([]);
  });

  it("injection string does not widen results", async () => {
    const rows = [
      { ...showcaseRow, id: "a" },
      { ...showcaseRow, id: "b", title_da: "Hidden", title_en: "Hidden" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getProjects("x),upvotes.gt.0,title_da.ilike.%(");
    expect(results).toEqual([]);
  });
});

describe("U1 — getAgents search (name, bilingual description, tag substring)", () => {
  it("matches on agent name", async () => {
    const rows = [
      { ...agentRow, id: "a", name: "CoolAgent" },
      { ...agentRow, id: "b", name: "OtherTool" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getAgents("cool")).map(r => r.id)).toEqual(["a"]);
  });

  it("matches on description_da and description_en", async () => {
    const rows = [
      { ...agentRow, id: "a", description_da: "Automatisering", description_en: "Automation" },
      { ...agentRow, id: "b", description_da: "x", description_en: "x" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    // 'da' lang: checks description_da
    expect((await db.getAgents("automati", undefined, "da")).map(r => r.id)).toEqual(["a"]);
    // 'en' lang but description_da also matched (bilingual)
    expect((await db.getAgents("automati", undefined, "en")).map(r => r.id)).toEqual(["a"]);
  });

  it("matches via tag substring — 'code' matches tag 'no-code' (pure tag-only, not exact-element)", async () => {
    // "no-code".includes("code") === true — substring within an array element.
    // The item has no "code" in name or description, so only the tag drives the match.
    const rows = [
      {
        ...agentRow,
        id: "a",
        name: "Tool",
        description_da: "x",
        description_en: "x",
        tags: ["no-code"],
      },
      { ...agentRow, id: "b", name: "Other", description_da: "x", description_en: "x", tags: [] },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getAgents("code")).map(r => r.id)).toEqual(["a"]);
  });

  it("SQL .or() clause is sent to the query builder when a search term is given", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents("claude");
    const call = state.publicCalls.find(c => c.table === "agents")!;
    expect(call.orClauses).toHaveLength(1);
    const clause = call.orClauses[0];
    expect(clause).toContain("name.ilike.%claude%");
    expect(clause).toContain("description_da.ilike.%claude%");
    expect(clause).toContain("description_en.ilike.%claude%");
    // tags::text cast covers array element substring matching at SQL level.
    expect(clause).toContain("tags::text.ilike.%claude%");
  });

  it("no SQL .or() clause is added when the search term is empty", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents("");
    const call = state.publicCalls.find(c => c.table === "agents")!;
    expect(call.orClauses).toHaveLength(0);
  });

  it("empty search returns all rows", async () => {
    const rows = [{ ...agentRow, id: "a" }, { ...agentRow, id: "b" }];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getAgents("")).map(r => r.id)).toEqual(["a", "b"]);
  });

  it("zero-match search returns []", async () => {
    state.publicHandler = () => ({ data: [agentRow], error: null });
    expect(await db.getAgents("xyzzy-no-match")).toEqual([]);
  });

  it("injection string does not error and returns no widened results", async () => {
    const rows = [
      { ...agentRow, id: "a", name: "Normal" },
      { ...agentRow, id: "b", name: "Hidden", description_da: "x", description_en: "x", tags: [] },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    const results = await db.getAgents("x),category.eq.CLI,name.ilike.%(");
    expect(results).toEqual([]);
  });

  it("getCli (getAgents wrapper) passes search through correctly", async () => {
    const rows = [
      { ...agentRow, id: "a", category: "CLI", name: "ClaudeCodeTool" },
      { ...agentRow, id: "b", category: "CLI", name: "UnrelatedThing" },
    ];
    state.publicHandler = () => ({ data: rows, error: null });
    expect((await db.getCli("claudecode")).map(r => r.id)).toEqual(["a"]);
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

// ---------------------------------------------------------------------------
// U2 — Cache Components caching with tagged revalidation
//
// IMPORTANT: "use cache", cacheTag, and revalidateTag are Next.js runtime APIs.
// In Vitest (no Next.js compiler), "use cache" is an inert string expression —
// the actual cache hit/miss behavior CANNOT be tested here. What we verify:
//
// 1. cacheTag is called with BOTH the broad entity-wide tag AND the
//    variant-specific tag on every read function invocation (so any mutation
//    calling revalidateTag('entity-list') invalidates ALL cached variants, not
//    just the default one — exact-string matching means every variant must carry
//    the broad tag explicitly).
//
// 2. revalidateTag is called with the correct tags and NO second argument
//    (immediate expiry, not stale-while-revalidate — KTD2 hard constraint).
//    A second argument of 'max' or any profile string would silently
//    reintroduce the stale-upvote-count bug this unit exists to prevent.
//
// 3. Mutations call revalidateTag on ALL success paths (authenticated user,
//    including the admin bypass path).
//
// 4. Functions excluded from caching in this unit (getCounts, getTopProjects,
//    getTopSkills, getTopAgents, getLatestPosts) do NOT call cacheTag.
//
// Full behavioral verification (cache invalidation actually dropping stale
// data on next read) requires a deployed Vercel preview environment with the
// real Next.js runtime — both prior stale-count bugs were invisible locally.
// ---------------------------------------------------------------------------

describe("U2 — cacheTag: broad + variant tags on every read function", () => {
  it("getSkills calls cacheTag with 'skills-list' (broad) AND variant tag", async () => {
    state.publicHandler = () => ({ data: [skillRow], error: null });
    await db.getSkills("react", "agent-methodology", "en", "hot");
    // There must be at least one cacheTag call whose first arg is the broad tag
    // AND that same call includes the variant-specific tag.
    const call = state.cacheTagCalls.find(tags => tags[0] === 'skills-list');
    expect(call, "cacheTag('skills-list', ...) must be called").toBeDefined();
    expect(call!.length).toBeGreaterThan(1);
    // Variant tag encodes category, search, lang, and view.
    const variantTag = call![1];
    expect(variantTag).toContain('agent-methodology');
    expect(variantTag).toContain('react');
    expect(variantTag).toContain('en');
    expect(variantTag).toContain('hot');
  });

  it("getSkills with no args still calls cacheTag with the broad 'skills-list' tag", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getSkills();
    const call = state.cacheTagCalls.find(tags => tags[0] === 'skills-list');
    expect(call).toBeDefined();
    // Both broad and variant tags must be present even for the default call.
    expect(call!.length).toBeGreaterThanOrEqual(2);
  });

  it("getProjects calls cacheTag with 'projects-list' (broad) AND variant tag", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getProjects("cursor", "da", "top");
    const call = state.cacheTagCalls.find(tags => tags[0] === 'projects-list');
    expect(call).toBeDefined();
    const variantTag = call![1];
    expect(variantTag).toContain('cursor');
    expect(variantTag).toContain('da');
    expect(variantTag).toContain('top');
  });

  it("getAgents calls cacheTag with 'agents-list' (broad) AND variant tag", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getAgents("claude", "CLI", "en");
    const call = state.cacheTagCalls.find(tags => tags[0] === 'agents-list');
    expect(call).toBeDefined();
    const variantTag = call![1];
    expect(variantTag).toContain('CLI');
    expect(variantTag).toContain('claude');
    expect(variantTag).toContain('en');
  });

  it("getCli calls cacheTag with 'agents-list' (broad) — same broad tag as getAgents", async () => {
    // getCli shares the 'agents-list' broad tag with getAgents so that
    // revalidateTag('agents-list') invalidates both cache entries at once.
    state.publicHandler = () => ({ data: [], error: null });
    await db.getCli("tool", "da");
    // getCli may call cacheTag once (itself) and then getAgents also calls cacheTag —
    // find the call that has 'CLI' in the variant tag.
    const cliCall = state.cacheTagCalls.find(
      tags => tags[0] === 'agents-list' && tags.some(t => t.includes('CLI'))
    );
    expect(cliCall, "getCli must call cacheTag('agents-list', '...CLI...')").toBeDefined();
  });

  it("getSkillById calls cacheTag with entity-specific tag 'skill-{id}' AND variant", async () => {
    state.publicHandler = () => ({ data: skillRow, error: null });
    await db.getSkillById("s1", "en");
    const call = state.cacheTagCalls.find(tags => tags.some(t => t === 'skill-s1'));
    expect(call, "cacheTag must include 'skill-s1'").toBeDefined();
    expect(call!.length).toBeGreaterThanOrEqual(2);
    // Variant tag must include the id and lang.
    expect(call!.join(' ')).toContain('s1');
    expect(call!.join(' ')).toContain('en');
  });

  it("getProjectById calls cacheTag with 'project-{id}' AND variant", async () => {
    state.publicHandler = () => ({ data: null, error: null });
    await db.getProjectById("p42", "da");
    const call = state.cacheTagCalls.find(tags => tags.some(t => t === 'project-p42'));
    expect(call).toBeDefined();
    expect(call!.length).toBeGreaterThanOrEqual(2);
  });

  it("getAgentById calls cacheTag with 'agent-{id}' AND variant", async () => {
    state.publicHandler = () => ({ data: null, error: null });
    await db.getAgentById("a99", "en");
    const call = state.cacheTagCalls.find(tags => tags.some(t => t === 'agent-a99'));
    expect(call).toBeDefined();
    expect(call!.length).toBeGreaterThanOrEqual(2);
  });

  it("getThreads calls cacheTag with 'threads-list' (broad) AND variant tag", async () => {
    state.publicHandler = (ops) =>
      ops.table === "forum_threads"
        ? { data: [{ id: "t1", title_da: "T", title_en: "T", author: "a", category: "General", content_da: "c", content_en: "c", upvotes: 1, created_at: "2026-01-01" }], error: null }
        : { data: [], error: null };
    await db.getThreads({ category: "General", lang: "da", limit: 5, sort: "new" });
    const call = state.cacheTagCalls.find(tags => tags[0] === 'threads-list');
    expect(call).toBeDefined();
    const variantTag = call![1];
    expect(variantTag).toContain('General');
    expect(variantTag).toContain('da');
    expect(variantTag).toContain('5');
    expect(variantTag).toContain('new');
  });

  it("getThreadById calls cacheTag with 'thread-{id}' AND variant", async () => {
    state.publicHandler = (ops) => {
      if (ops.table === "forum_threads") return {
        data: { id: "t5", title_da: "T", title_en: "T", author: "a", category: "General", content_da: "c", content_en: "c", upvotes: 1, created_at: "2026-01-01" },
        error: null
      };
      return { data: [], error: null };
    };
    await db.getThreadById("t5", "en");
    const call = state.cacheTagCalls.find(tags => tags.some(t => t === 'thread-t5'));
    expect(call).toBeDefined();
    expect(call!.length).toBeGreaterThanOrEqual(2);
    expect(call!.join(' ')).toContain('en');
  });

  it("getBlogPosts calls cacheTag with 'blog-posts' (broad) AND lang-scoped variant", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getBlogPosts("en");
    const call = state.cacheTagCalls.find(tags => tags[0] === 'blog-posts');
    expect(call).toBeDefined();
    expect(call!.length).toBeGreaterThanOrEqual(2);
    expect(call!.join(' ')).toContain('en');
  });

  it("getBlogPostById calls cacheTag with 'blog-post-{id}' AND variant", async () => {
    state.publicHandler = () => ({ data: null, error: null });
    await db.getBlogPostById("b7", "da");
    const call = state.cacheTagCalls.find(tags => tags.some(t => t === 'blog-post-b7'));
    expect(call).toBeDefined();
    expect(call!.length).toBeGreaterThanOrEqual(2);
  });

  // The most important tag-scoping test: a filtered/searched variant must carry the
  // broad entity-wide tag so revalidateTag('skills-list') invalidates it — not just
  // the default unfiltered variant. This is the test that catches the "only the
  // default variant gets invalidated" tag-scoping bug described in the plan.
  it("a filtered getSkills call (category + search) carries BOTH broad 'skills-list' AND variant-specific tag", async () => {
    state.publicHandler = () => ({ data: [], error: null });
    await db.getSkills("agent", "productivity", "da");
    const broadTagCall = state.cacheTagCalls.find(tags => tags[0] === 'skills-list');
    expect(broadTagCall, "filtered call must carry broad 'skills-list' tag").toBeDefined();
    const variantTag = broadTagCall![1];
    // Variant must encode both the category AND the search term so it's distinct
    // from the default-view cache entry.
    expect(variantTag).toContain('productivity');
    expect(variantTag).toContain('agent');
    // The broad tag is always index 0: a single revalidateTag('skills-list') call
    // from upvoteSkill will expire THIS filtered cache entry too, not just the
    // default 'skills-list:all::da:' entry.
    expect(broadTagCall![0]).toBe('skills-list');
  });

  it("getCounts and getLatestPosts remain excluded from caching", async () => {
    state.publicHandler = () => ({ count: 0, data: null, error: null });
    await db.getCounts();
    const countsBefore = state.cacheTagCalls.length;

    state.publicHandler = () => ({ data: [], error: null });
    await db.getLatestPosts(1, "da");

    // Neither should have called cacheTag.
    expect(state.cacheTagCalls.length).toBe(countsBefore);
  });

  // U6 (Ahrefs SEO fix plan) — getTopProjects/getTopSkills/getTopAgents were
  // verified safe to cache: fixed limit/lang call shape from the homepage,
  // and they reuse the existing broad list tags so any mutation that already
  // calls revalidateTag('projects-list' | 'skills-list' | 'agents-list')
  // also invalidates these homepage aggregates.
  it("getTopProjects/getTopSkills/getTopAgents carry the existing broad list tag plus a variant tag", async () => {
    state.publicHandler = () => ({ data: [], error: null });

    await db.getTopProjects(5, "da");
    const topProjectsTag = state.cacheTagCalls.at(-1);
    expect(topProjectsTag![0]).toBe('projects-list');
    expect(topProjectsTag![1]).toBe('top-projects:5:da');

    await db.getTopSkills(4, "en");
    const topSkillsTag = state.cacheTagCalls.at(-1);
    expect(topSkillsTag![0]).toBe('skills-list');
    expect(topSkillsTag![1]).toBe('top-skills:4:en');

    await db.getTopAgents(1, "da");
    const topAgentsTag = state.cacheTagCalls.at(-1);
    expect(topAgentsTag![0]).toBe('agents-list');
    expect(topAgentsTag![1]).toBe('top-agents:1:da');
  });
});

describe("U2 — revalidateTag: correct tags, no profile arg, on all mutation paths", () => {
  // Hard constraint from KTD2: revalidateTag must be called WITHOUT a profile
  // argument. A second arg of 'max' or any profile string gives stale-while-
  // revalidate semantics and would silently reintroduce the stale-count bug.
  // We verify this by checking that every revalidateTag call recorded in state
  // has exactly one element (just the tag string, no second arg).

  function assertNoProfileArg() {
    for (const call of state.revalidateTagCalls) {
      expect(call.length, `revalidateTag called with extra args: ${JSON.stringify(call)}`).toBe(1);
    }
  }

  // Helper for U2 revalidateTag tests: after U8 the count comes from the
  // toggle_upvote RPC, not from a re-select.  admin_bump_upvotes must return
  // null so the non-admin path (toggle_upvote) executes.
  function makeU2RpcHandler(toggleCount = 5) {
    return (fn: string) => {
      if (fn === "admin_bump_upvotes") return { data: null, error: null }; // not admin
      return { data: toggleCount, error: null }; // toggle_upvote returns count
    };
  }

  it("upvoteSkill calls revalidateTag('skills-list') and revalidateTag('skill-{id}') with no profile arg", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = makeU2RpcHandler(5);
    await db.upvoteSkill("s1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('skills-list');
    expect(tags).toContain('skill-s1');
    assertNoProfileArg();
  });

  it("upvoteSkill admin path also calls revalidateTag (admin path also mutates counts)", async () => {
    state.user = { id: "admin" };
    state.rpcHandler = () => ({ data: 42, error: null }); // admin_bump_upvotes returns 42
    await db.upvoteSkill("s1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('skills-list');
    expect(tags).toContain('skill-s1');
    assertNoProfileArg();
  });

  it("upvoteSkill unauthenticated path does NOT call revalidateTag (no mutation occurred)", async () => {
    state.user = null;
    await db.upvoteSkill("s1");
    expect(state.revalidateTagCalls.length).toBe(0);
  });

  it("upvoteProject calls revalidateTag('projects-list') and revalidateTag('project-{id}')", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = makeU2RpcHandler(3);
    await db.upvoteProject("p1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('projects-list');
    expect(tags).toContain('project-p1');
    assertNoProfileArg();
  });

  it("upvoteAgent calls revalidateTag('agents-list') and revalidateTag('agent-{id}')", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = makeU2RpcHandler(7);
    await db.upvoteAgent("a1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('agents-list');
    expect(tags).toContain('agent-a1');
    assertNoProfileArg();
  });

  it("upvoteThread calls revalidateTag('threads-list') and revalidateTag('thread-{id}')", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = makeU2RpcHandler(4);
    await db.upvoteThread("t1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('threads-list');
    expect(tags).toContain('thread-t1');
    assertNoProfileArg();
  });

  it("upvoteReply calls revalidateTag('threads-list') and revalidateTag('thread-{threadId}') from reply row", async () => {
    state.user = { id: "u1" };
    state.rpcHandler = makeU2RpcHandler(2);
    // publicHandler returns thread_id for the secondary SELECT upvoteReply still makes.
    // (upvoteReply needs thread_id to invalidate the specific getThreadById cache entry.)
    state.publicHandler = () => ({ data: { thread_id: "t99" }, error: null });
    await db.upvoteReply("r1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('threads-list');
    expect(tags).toContain('thread-t99');
    assertNoProfileArg();
  });

  it("createProject calls revalidateTag('projects-list') on successful insert", async () => {
    const row = { id: "p_new", title_da: "T", title_en: "T", author: "a", description_da: "d", description_en: "d", tools: null, prompts: null, upvotes: 1, demo_url: null, github_url: null, image_url: null, created_at: "2026-01-01" };
    state.serverHandler = () => ({ data: row, error: null });
    await db.createProject("Title", "Author", "Desc", [], [], "https://demo.com");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('projects-list');
    assertNoProfileArg();
  });

  it("createProject does NOT call revalidateTag on insert failure", async () => {
    state.serverHandler = () => ({ data: null, error: { message: "insert failed" } });
    await expect(db.createProject("Title", "Author", "Desc", [], [], "https://demo.com")).rejects.toThrow();
    expect(state.revalidateTagCalls.length).toBe(0);
  });

  it("deleteProject calls revalidateTag('projects-list') and revalidateTag('project-{id}') when succeeded", async () => {
    state.serverHandler = () => ({ data: [{ id: "p1" }], error: null });
    await db.deleteProject("p1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('projects-list');
    expect(tags).toContain('project-p1');
    assertNoProfileArg();
  });

  it("deleteProject does NOT call revalidateTag when no row deleted (not owner or not found)", async () => {
    state.serverHandler = () => ({ data: [], error: null });
    await db.deleteProject("p1");
    expect(state.revalidateTagCalls.length).toBe(0);
  });

  it("deleteThread calls revalidateTag('threads-list') and revalidateTag('thread-{id}') when succeeded", async () => {
    state.serverHandler = () => ({ data: [{ id: "t1" }], error: null });
    await db.deleteThread("t1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('threads-list');
    expect(tags).toContain('thread-t1');
    assertNoProfileArg();
  });

  it("deleteReply calls revalidateTag('threads-list') and revalidateTag('thread-{threadId}') when succeeded", async () => {
    state.serverHandler = () => ({ data: [{ id: "r1" }], error: null });
    await db.deleteReply("t5", "r1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('threads-list');
    expect(tags).toContain('thread-t5');
    assertNoProfileArg();
  });

  it("createSkill calls revalidateTag('skills-list') on successful insert", async () => {
    const row = { id: "s_new", title_da: "T", title_en: "T", category: "agent-methodology", vibe_coder: "alice", vibe_coder_title_da: "Bidragyder", vibe_coder_title_en: "Contributor", rating: "5.0", reviews_count: 0, description_da: "d", description_en: "d", tags: [], github_url: null };
    state.serverHandler = () => ({ data: row, error: null });
    await db.createSkill("Title", "Alice", "Desc", "agent-methodology", []);
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('skills-list');
    assertNoProfileArg();
  });

  it("createAgent calls revalidateTag('agents-list') on successful insert", async () => {
    const row = { id: "a_new", name: "Agent", developer: "dev", category: "CLI", description_da: "d", description_en: "d", install_command: "npx", system_prompt_da: "s", system_prompt_en: "s", upvotes: 1, tags: [] };
    state.serverHandler = () => ({ data: row, error: null });
    await db.createAgent("Agent", "dev", "CLI", "Desc", "npx agent", "system prompt", []);
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('agents-list');
    assertNoProfileArg();
  });

  it("deleteAgent calls revalidateTag('agents-list') and revalidateTag('agent-{id}') when succeeded", async () => {
    state.serverHandler = () => ({ data: [{ id: "a1" }], error: null });
    await db.deleteAgent("a1");
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('agents-list');
    expect(tags).toContain('agent-a1');
    assertNoProfileArg();
  });

  // This is the key correctness test for filtered views: upvoting from any variant
  // (filtered by category/search) must cause the next read of THAT variant to
  // reflect the new count. In practice this is guaranteed because:
  // 1. The filtered variant carries the broad 'skills-list' tag (verified in the
  //    cacheTag suite above).
  // 2. upvoteSkill calls revalidateTag('skills-list') with NO profile arg (verified
  //    here), which expires ALL cache entries tagged 'skills-list' — including the
  //    filtered variant — not just the default one.
  // The "cache actually drops the stale entry" part requires the real Next.js
  // runtime; what we verify here is the structural guarantee that makes it work.
  it("upvoteSkill invalidates 'skills-list' — the broad tag that ALL filtered getSkills variants carry", async () => {
    // Confirm upvoteSkill's revalidation tag matches the broad tag that
    // a filtered getSkills call carries (verified separately in the cacheTag suite).
    state.user = { id: "u1" };
    state.rpcHandler = makeU2RpcHandler(8);
    await db.upvoteSkill("s1");
    // The broad tag that getSkills ALWAYS emits (regardless of filter args) must
    // appear in the revalidateTag calls so every cached variant gets expired.
    const tags = state.revalidateTagCalls.map(c => c[0]);
    expect(tags).toContain('skills-list');
    // No profile arg — immediate expiry, not stale-while-revalidate.
    assertNoProfileArg();
  });

  it("cacheLife is called with 'max' on read functions (tag-only invalidation, effectively infinite TTL)", async () => {
    // 'max' profile means the cache never self-expires via TTL — only revalidateTag
    // can invalidate it. This is the KTD2 guarantee: counts are never served from
    // a timed expiry window after a vote; they're only refreshed when we explicitly
    // call revalidateTag.
    state.publicHandler = () => ({ data: [], error: null });
    await db.getSkills();
    expect(state.cacheLifeCalls).toContain('max');

    state.cacheLifeCalls = [];
    await db.getProjects();
    expect(state.cacheLifeCalls).toContain('max');

    state.cacheLifeCalls = [];
    await db.getAgents();
    expect(state.cacheLifeCalls).toContain('max');

    state.cacheLifeCalls = [];
    await db.getBlogPosts();
    expect(state.cacheLifeCalls).toContain('max');
  });
});
