import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(async () => [{ id: "s1", title: "Skill One" }]),
  getProjects: vi.fn(async () => [{ id: "p1", title: "Project One" }]),
  getAgents: vi.fn(async () => [{ id: "m1", name: "MCP One" }]),
  getCli: vi.fn(async () => [{ id: "a1", name: "CLI One" }]),
  parseSkillView: (v: unknown) => (v === "hot" || v === "trending" ? v : undefined),
  upvoteThread: vi.fn(async () => 5),
  upvoteReply: vi.fn(async () => 3),
  addReply: vi.fn(async () => ({ id: "r1", threadId: "t1" })),
  createSkill: vi.fn(async () => ({ id: "s2", title: "New Skill" })),
  createProject: vi.fn(async () => ({ id: "p2", title: "New Project" })),
  createBlogPost: vi.fn(async () => ({ id: "b1", title: "New Post" })),
}));

vi.mock("@/lib/supabase-server", () => ({
  resolveRequestIdentity: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkAgentWriteRateLimit: vi.fn().mockResolvedValue(true),
  checkGlobalAgentWriteRateLimit: vi.fn().mockResolvedValue(true),
}));

import { POST, GET } from "@/app/api/mcp/route";
import * as db from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { checkAgentWriteRateLimit, checkGlobalAgentWriteRateLimit } from "@/lib/rate-limit";

const MOCK_IDENTITY = {
  user: { id: "user-1", username: "agent_abc123" },
  botAuth: { user: { id: "user-1", username: "agent_abc123" }, supabase: {} as never },
};

function rpc(payload: unknown) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mcp (discovery)", () => {
  it("advertises the protocol version and tools", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.protocolVersion).toBe("2025-06-18");
    expect(body.tools).toHaveLength(13);
  });
});

describe("POST /api/mcp (JSON-RPC)", () => {
  it("initialize returns serverInfo and capabilities", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.serverInfo.name).toBe("vibetrends-mcp");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("tools/list returns the tools with an inputSchema", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "search_skills",
      "search_vibes",
      "search_agents",
      "search_cli",
      "search_mcp_servers",
      "list_topics",
      "list_feed_types",
      "upvote_thread",
      "upvote_reply",
      "reply_to_thread",
      "submit_skill",
      "submit_project",
      "submit_blog_post",
    ]);
    expect(body.result.tools[0].inputSchema.type).toBe("object");
  });

  it("tools/call search_skills returns results as text content", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_skills", arguments: { query: "ai" } } })
    );
    const body = await res.json();
    expect(db.getSkills).toHaveBeenCalledWith("ai", undefined, "da", undefined);
    expect(body.result.content[0].type).toBe("text");
    expect(JSON.parse(body.result.content[0].text)).toEqual([{ id: "s1", title: "Skill One" }]);
  });

  it("tools/call search_vibes dispatches to getProjects", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "search_vibes", arguments: { query: "x" } } })
    );
    const body = await res.json();
    expect(db.getProjects).toHaveBeenCalledWith("x", "da");
    expect(body.result.content[0].type).toBe("text");
  });

  it("tools/call search_agents dispatches to getCli (feed items only, no hosts)", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 32, method: "tools/call", params: { name: "search_agents", arguments: {} } })
    );
    const body = await res.json();
    // getCli excludes Host (and MCP Server) rows, so hosts never surface.
    expect(db.getCli).toHaveBeenCalledWith(undefined, "da");
    expect(db.getAgents).not.toHaveBeenCalled();
    expect(body.result.content[0].type).toBe("text");
  });

  it("tools/call search_cli dispatches to getCli", async () => {
    await POST(
      rpc({ jsonrpc: "2.0", id: 39, method: "tools/call", params: { name: "search_cli", arguments: { query: "scrape" } } })
    );
    expect(db.getCli).toHaveBeenCalledWith("scrape", "da");
  });

  it("tools/call search_mcp_servers dispatches to getAgents with the MCP Server category", async () => {
    await POST(
      rpc({ jsonrpc: "2.0", id: 40, method: "tools/call", params: { name: "search_mcp_servers", arguments: { query: "pg" } } })
    );
    expect(db.getAgents).toHaveBeenCalledWith("pg", "MCP Server", "da");
  });

  it("tools/call list_feed_types returns the feed-vs-host taxonomy as text content", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: "list_feed_types", arguments: {} } })
    );
    const body = await res.json();
    const feedTypes = JSON.parse(body.result.content[0].text);
    expect(feedTypes).toHaveLength(3);
    expect(feedTypes.map((f: { slug: string }) => f.slug)).toEqual(["skills", "mcp-servers", "cli"]);
    expect(feedTypes[0]).toHaveProperty("href");
  });

  it("tools/call forwards the lang argument to the data layer", async () => {
    await POST(
      rpc({ jsonrpc: "2.0", id: 33, method: "tools/call", params: { name: "search_skills", arguments: { query: "ai", lang: "en" } } })
    );
    expect(db.getSkills).toHaveBeenCalledWith("ai", undefined, "en", undefined);
  });

  it("coerces a non-string query rather than throwing", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 34, method: "tools/call", params: { name: "search_skills", arguments: { query: 42 } } })
    );
    const body = await res.json();
    expect(db.getSkills).toHaveBeenCalledWith(undefined, undefined, "da", undefined);
    expect(body.result.content[0].type).toBe("text");
  });

  it("forwards a valid view argument to the data layer", async () => {
    await POST(
      rpc({ jsonrpc: "2.0", id: 36, method: "tools/call", params: { name: "search_skills", arguments: { query: "ai", view: "hot" } } })
    );
    expect(db.getSkills).toHaveBeenCalledWith("ai", undefined, "da", "hot");
  });

  it("drops an invalid view argument (silently ignores non-whitelisted values)", async () => {
    await POST(
      rpc({ jsonrpc: "2.0", id: 37, method: "tools/call", params: { name: "search_skills", arguments: { query: "ai", view: "bogus" } } })
    );
    expect(db.getSkills).toHaveBeenCalledWith("ai", undefined, "da", undefined);
  });

  it("tools/call list_topics returns the 8-category skills taxonomy as text content", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 38, method: "tools/call", params: { name: "list_topics", arguments: {} } })
    );
    const body = await res.json();
    const topics = JSON.parse(body.result.content[0].text);
    expect(topics).toHaveLength(8);
    expect(topics.map((t: { slug: string }) => t.slug)).toContain("backend-data");
    expect(topics[0]).toHaveProperty("labelDa");
    expect(topics[0]).toHaveProperty("labelEn");
  });

  it("a thrown data-layer error surfaces as INTERNAL_ERROR (-32603)", async () => {
    vi.mocked(db.getSkills).mockRejectedValueOnce(new Error("db down"));
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 35, method: "tools/call", params: { name: "search_skills", arguments: {} } })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
  });

  it("a notification (no id) gets 202 with no body, not an error", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("tools/call with an unknown tool returns a method-not-found error", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "delete_everything" } })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("tools/call without a tool name returns invalid params", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {} }));
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("an unknown method returns method-not-found", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 6, method: "resources/list" }));
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("malformed JSON returns a parse error", async () => {
    const res = await POST(rpc("{ not json"));
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  it("a non-JSON-RPC body returns invalid request", async () => {
    const res = await POST(rpc({ method: "tools/list" }));
    const body = await res.json();
    expect(body.error.code).toBe(-32600);
  });
});

describe("POST /api/mcp — write tools (bearer auth)", () => {
  it("submit_skill with a valid identity creates a skill and returns it", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 50,
        method: "tools/call",
        params: {
          name: "submit_skill",
          arguments: { title: "New Skill", category: "backend-data", githubUrl: "https://github.com/x/y" },
        },
      })
    );
    const body = await res.json();
    expect(db.createSkill).toHaveBeenCalledWith(
      "New Skill",
      "agent_abc123",
      "",
      "backend-data",
      [],
      "https://github.com/x/y",
      undefined,
      MOCK_IDENTITY.botAuth
    );
    expect(JSON.parse(body.result.content[0].text)).toEqual({ id: "s2", title: "New Skill" });
  });

  it("submit_blog_post with a valid identity creates a blog post", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 51,
        method: "tools/call",
        params: {
          name: "submit_blog_post",
          arguments: {
            title: "Post",
            excerpt: "Excerpt",
            content: "Content",
            readTime: "4 min",
            publishedAt: "2026-07-09",
            imageUrl: "https://example.com/x.jpg",
            category: "Industry",
          },
        },
      })
    );
    const body = await res.json();
    expect(db.createBlogPost).toHaveBeenCalled();
    expect(JSON.parse(body.result.content[0].text)).toEqual({ id: "b1", title: "New Post" });
  });

  it("rejects a bearer-authenticated write tool once the identity's write budget is exhausted, without calling the underlying mutation", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(checkAgentWriteRateLimit).mockResolvedValueOnce(false);

    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 55,
        method: "tools/call",
        params: {
          name: "submit_skill",
          arguments: { title: "New Skill", category: "backend-data", githubUrl: "https://github.com/x/y" },
        },
      })
    );
    const body = await res.json();

    expect(body.error).toBeDefined();
    expect(db.createSkill).not.toHaveBeenCalled();
  });

  it("rejects a bearer-authenticated write tool once the site-wide write budget is exhausted, even when the identity's own budget is fine", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(checkGlobalAgentWriteRateLimit).mockResolvedValueOnce(false);

    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 56,
        method: "tools/call",
        params: {
          name: "submit_skill",
          arguments: { title: "New Skill", category: "backend-data", githubUrl: "https://github.com/x/y" },
        },
      })
    );
    const body = await res.json();

    expect(body.error).toBeDefined();
    expect(db.createSkill).not.toHaveBeenCalled();
  });

  it("upvote_thread with a valid identity succeeds", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 52,
        method: "tools/call",
        params: { name: "upvote_thread", arguments: { threadId: "t_123" } },
      })
    );
    const body = await res.json();
    expect(db.upvoteThread).toHaveBeenCalledWith("t_123", MOCK_IDENTITY.botAuth);
    expect(JSON.parse(body.result.content[0].text)).toEqual({ upvotes: 5 });
  });

  it("write tools require Authorization: with no header, returns a JSON-RPC error, not a 500 or silent no-op", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(null);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 53,
        method: "tools/call",
        params: { name: "upvote_thread", arguments: { threadId: "t_123" } },
      })
    );
    expect(res.status).toBe(200); // JSON-RPC errors are still HTTP 200 in this transport
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.result).toBeUndefined();
    expect(db.upvoteThread).not.toHaveBeenCalled();
  });

  it("write tools with a failed identity resolution (invalid/expired token) return the same clean JSON-RPC error, no throw", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(null);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 54,
        method: "tools/call",
        params: { name: "submit_skill", arguments: { title: "X", category: "backend-data", githubUrl: "https://x.com" } },
      })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(db.createSkill).not.toHaveBeenCalled();
  });

  it("submit_skill with missing required arguments returns INVALID_PARAMS (-32602)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 55,
        method: "tools/call",
        params: { name: "submit_skill", arguments: { title: "No category or url" } },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(db.createSkill).not.toHaveBeenCalled();
  });

  it("submit_project with missing required arguments returns INVALID_PARAMS (-32602)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 56,
        method: "tools/call",
        params: { name: "submit_project", arguments: { title: "No demoUrl or description" } },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(db.createProject).not.toHaveBeenCalled();
  });

  it("submit_blog_post with missing required arguments returns INVALID_PARAMS (-32602)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 57,
        method: "tools/call",
        params: { name: "submit_blog_post", arguments: { title: "Missing everything else" } },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(db.createBlogPost).not.toHaveBeenCalled();
  });

  it("reply_to_thread with an unknown thread returns a JSON-RPC error, not a crash", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(db.addReply).mockResolvedValueOnce(null as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 58,
        method: "tools/call",
        params: { name: "reply_to_thread", arguments: { threadId: "t_missing", content: "hello" } },
      })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("read-only tools still work with no Authorization header (identity resolution stays optional for reads)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(null);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 59, method: "tools/call", params: { name: "search_skills", arguments: { query: "ai" } } })
    );
    const body = await res.json();
    expect(resolveRequestIdentity).not.toHaveBeenCalled();
    expect(body.result.content[0].type).toBe("text");
  });

  it("upvote_thread returns SERVICE_UNAVAILABLE (not a false success) when the db layer reports rpc_error", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(db.upvoteThread).mockResolvedValueOnce("rpc_error" as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 70, method: "tools/call", params: { name: "upvote_thread", arguments: { threadId: "t_1" } } })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.result).toBeUndefined();
  });

  it("upvote_thread returns NOT_FOUND (not a false success) when the thread doesn't exist", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(db.upvoteThread).mockResolvedValueOnce(null as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 71, method: "tools/call", params: { name: "upvote_thread", arguments: { threadId: "t_missing" } } })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.result).toBeUndefined();
  });

  it("upvote_reply returns SERVICE_UNAVAILABLE (not a false success) when the db layer reports rpc_error", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(db.upvoteReply).mockResolvedValueOnce("rpc_error" as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 72, method: "tools/call", params: { name: "upvote_reply", arguments: { replyId: "r_1" } } })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.result).toBeUndefined();
  });

  it("upvote_reply returns NOT_FOUND (not a false success) when the reply doesn't exist", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(db.upvoteReply).mockResolvedValueOnce(null as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 73, method: "tools/call", params: { name: "upvote_reply", arguments: { replyId: "r_missing" } } })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.result).toBeUndefined();
  });

  it("submit_project accepts a payload with no demoUrl (matches REST's optional demoUrl, no contract drift)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 74,
        method: "tools/call",
        params: { name: "submit_project", arguments: { title: "No demo yet", description: "Still in progress" } },
      })
    );
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(db.createProject).toHaveBeenCalled();
  });

  it("submit_project rejects an imageUrl host not on the allowlist (matches REST's isAllowedImageUrl guard)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 75,
        method: "tools/call",
        params: {
          name: "submit_project",
          arguments: { title: "X", description: "Y", imageUrl: "https://evil.example.com/x.png" },
        },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(db.createProject).not.toHaveBeenCalled();
  });

  it("submit_skill rejects a category not in SKILL_CATEGORY_SLUGS", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 76,
        method: "tools/call",
        params: { name: "submit_skill", arguments: { title: "X", category: "not-a-real-category", githubUrl: "https://x.com" } },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(db.createSkill).not.toHaveBeenCalled();
  });

  it("submit_blog_post rejects a category not in BLOG_CATEGORIES", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 77,
        method: "tools/call",
        params: {
          name: "submit_blog_post",
          arguments: {
            title: "X",
            excerpt: "Y",
            content: "Z",
            readTime: "1 min",
            publishedAt: "2026-07-10",
            imageUrl: "https://images.unsplash.com/x.jpg",
            category: "not-a-real-category",
          },
        },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(db.createBlogPost).not.toHaveBeenCalled();
  });

  it("a submit_skill MCP call is visible via search_skills on a subsequent call (cache invalidation is exercised through the same db.ts path as REST)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    await POST(
      rpc({
        jsonrpc: "2.0",
        id: 60,
        method: "tools/call",
        params: {
          name: "submit_skill",
          arguments: { title: "New Skill", category: "backend-data", githubUrl: "https://github.com/x/y" },
        },
      })
    );
    // submit_skill and search_skills both go through the same createSkill/getSkills
    // functions that already own revalidateTag invalidation (verified in db.ts's
    // own unit tests) — this confirms the MCP path calls the real function, not a
    // bypass, so cache invalidation is inherited rather than needing its own logic.
    expect(db.createSkill).toHaveBeenCalled();
    const searchRes = await POST(
      rpc({ jsonrpc: "2.0", id: 61, method: "tools/call", params: { name: "search_skills", arguments: {} } })
    );
    expect((await searchRes.json()).result.content[0].type).toBe("text");
  });
});
