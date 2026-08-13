import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(async () => [{ id: "s1", title: "Skill One" }]),
  getProjects: vi.fn(async () => [{ id: "p1", title: "Project One" }]),
  getAgents: vi.fn(async () => [{ id: "m1", name: "MCP One" }]),
  getCli: vi.fn(async () => [{ id: "a1", name: "CLI One" }]),
  getThreads: vi.fn(async () => [{ id: "t1", title: "Thread One" }]),
  getFeedItems: vi.fn(async () => [{ id: "f1", type: "skill", title: "Feed Item" }]),
  parseSkillView: (v: unknown) => (v === "danish" || v === "hot" || v === "trending" ? v : undefined),
  upvoteThread: vi.fn(async () => 5),
  upvoteReply: vi.fn(async () => 3),
  upvoteSkill: vi.fn(async () => 7),
  upvoteProject: vi.fn(async () => 10),
  upvoteAgent: vi.fn(async () => 4),
  addReply: vi.fn(async () => ({ thread: { id: "t1", replies: [] }, replyId: "r1" })),
  createSkill: vi.fn(async () => ({ id: "s2", title: "New Skill" })),
  createProject: vi.fn(async () => ({ id: "p2", title: "New Project" })),
  createAgent: vi.fn(async () => ({ id: "a2", name: "New Agent" })),
  createThread: vi.fn(async () => ({ id: "t2", title: "New Thread" })),
  createBlogPost: vi.fn(async () => ({ id: "b1", title: "New Post" })),
}));

const mockSignInAnonymously = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  resolveRequestIdentity: vi.fn(),
  supabasePublic: {
    auth: {
      signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
  getClientIp: vi.fn((request: Request) => {
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();

    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const hops = forwardedFor.split(",").map((h) => h.trim()).filter(Boolean);
      if (hops.length > 0) return hops[hops.length - 1];
    }

    return "unknown";
  }),
  resolveAgentWriteLimit: vi.fn().mockResolvedValue("ok"),
}));

import { POST, GET } from "@/app/api/mcp/route";
import * as db from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { checkRateLimit, resolveAgentWriteLimit } from "@/lib/rate-limit";

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
  vi.mocked(checkRateLimit).mockResolvedValue(true);
  mockSignInAnonymously.mockResolvedValue({
    data: {
      session: {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
      },
    },
    error: null,
  });
});

describe("GET /api/mcp (discovery)", () => {
  it("advertises the protocol version and tools", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.protocolVersion).toBe("2025-06-18");
    expect(body.tools).toHaveLength(21);
  });
});

describe("POST /api/mcp (JSON-RPC core & discovery)", () => {
  it("initialize returns serverInfo and capabilities", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.serverInfo.name).toBe("vibetrends-mcp");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("tools/list returns all tools with an inputSchema", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "search_skills",
      "search_vibes",
      "search_agents",
      "search_cli",
      "search_mcp_servers",
      "search_forum",
      "list_topics",
      "get_market_updates",
      "list_feed_types",
      "request_agent_auth",
      "upvote_skill",
      "upvote_vibe",
      "upvote_agent",
      "upvote_thread",
      "upvote_reply",
      "create_forum_thread",
      "reply_to_thread",
      "submit_skill",
      "submit_project",
      "submit_agent",
      "submit_blog_post",
    ]);
    expect(body.result.tools[0].inputSchema.type).toBe("object");
  });

  it("tools/call search_skills returns results as text content", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_skills", arguments: { query: "ai", view: "danish" } } })
    );
    const body = await res.json();
    expect(db.getSkills).toHaveBeenCalledWith("ai", undefined, "da", "danish");
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

  it("tools/call search_forum queries threads correctly", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: "search_forum", arguments: { query: "nextjs", category: "General", sort: "new" } } })
    );
    const body = await res.json();
    expect(db.getThreads).toHaveBeenCalledWith({ search: "nextjs", category: "General", lang: "da", sort: "new" });
    expect(body.result.content[0].type).toBe("text");
  });

  it("tools/call get_market_updates fetches updates with since filter", async () => {
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 42,
        method: "tools/call",
        params: {
          name: "get_market_updates",
          arguments: { since: "2026-08-01T00:00:00Z", types: ["skill", "vibe"], limit: 10 },
        },
      })
    );
    const body = await res.json();
    expect(db.getFeedItems).toHaveBeenCalledWith({
      since: "2026-08-01T00:00:00Z",
      types: ["skill", "vibe"],
      lang: "da",
      limit: 10,
    });
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.items).toBeDefined();
  });

  it("tools/call get_market_updates rejects invalid since timestamp", async () => {
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 43,
        method: "tools/call",
        params: { name: "get_market_updates", arguments: { since: "invalid-date" } },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("tools/call list_feed_types returns the feed-vs-host taxonomy as text content", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 44, method: "tools/call", params: { name: "list_feed_types", arguments: {} } })
    );
    const body = await res.json();
    const feedTypes = JSON.parse(body.result.content[0].text);
    expect(feedTypes).toHaveLength(3);
    expect(feedTypes.map((f: { slug: string }) => f.slug)).toEqual(["skills", "mcp-servers", "cli"]);
  });

  it("tools/call list_topics returns the 8-category skills taxonomy", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 45, method: "tools/call", params: { name: "list_topics", arguments: {} } })
    );
    const body = await res.json();
    const topics = JSON.parse(body.result.content[0].text);
    expect(topics).toHaveLength(8);
    expect(topics.map((t: { slug: string }) => t.slug)).toContain("backend-data");
  });

  it("tools/call request_agent_auth provisions anonymous identity successfully", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 46, method: "tools/call", params: { name: "request_agent_auth", arguments: {} } })
    );
    const body = await res.json();
    expect(mockSignInAnonymously).toHaveBeenCalled();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.access_token).toBe("test-access-token");
    expect(result.refresh_token).toBe("test-refresh-token");
    expect(result.token_type).toBe("bearer");
  });

  it("tools/call request_agent_auth returns RATE_LIMITED when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (key: string) => {
      if (key.startsWith("agentauth:")) return false;
      return true;
    });
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 47, method: "tools/call", params: { name: "request_agent_auth", arguments: {} } })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32003);
  });

  it("a notification (no id) gets 202 with no body, not an error", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("tools/call with an unknown tool returns a method-not-found error (-32601)", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 48, method: "tools/call", params: { name: "unknown_tool" } })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("tools/call without a tool name returns invalid params (-32602)", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 49, method: "tools/call", params: {} }));
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("an unknown method returns method-not-found (-32601)", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 50, method: "resources/list" }));
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("malformed JSON returns a parse error (-32700)", async () => {
    const res = await POST(rpc("{ not json"));
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  it("a non-JSON-RPC body returns invalid request (-32600)", async () => {
    const res = await POST(rpc({ method: "tools/list" }));
    const body = await res.json();
    expect(body.error.code).toBe(-32600);
  });
});

describe("POST /api/mcp — write tools (auth & execution)", () => {
  it("submit_skill with a valid identity queues a skill and returns a pending receipt", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 51,
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
      undefined,
      MOCK_IDENTITY.botAuth
    );
    const skillResult = JSON.parse(body.result.content[0].text);
    expect(skillResult).toMatchObject({ status: "pending", id: "s2" });
  });

  it("submit_project with a valid identity queues a project and returns a pending receipt", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 52,
        method: "tools/call",
        params: {
          name: "submit_project",
          arguments: { title: "New Vibe", description: "Built with AI agents", tools: ["Next.js", "Supabase"] },
        },
      })
    );
    const body = await res.json();
    expect(db.createProject).toHaveBeenCalledWith(
      "New Vibe",
      "agent_abc123",
      "Built with AI agents",
      ["Next.js", "Supabase"],
      [],
      "",
      undefined,
      undefined,
      undefined,
      MOCK_IDENTITY.botAuth
    );
    const projectResult = JSON.parse(body.result.content[0].text);
    expect(projectResult).toMatchObject({ status: "pending", id: "p2" });
  });

  it("submit_agent with a valid identity queues an agent and returns a pending receipt", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 53,
        method: "tools/call",
        params: {
          name: "submit_agent",
          arguments: {
            name: "New Tool",
            category: "CLI",
            description: "A fast CLI tool for agents",
            installCommand: "npx new-tool",
          },
        },
      })
    );
    const body = await res.json();
    expect(db.createAgent).toHaveBeenCalledWith(
      "New Tool",
      "agent_abc123",
      "CLI",
      "A fast CLI tool for agents",
      "npx new-tool",
      "",
      [],
      undefined,
      undefined,
      MOCK_IDENTITY.botAuth
    );
    const agentResult = JSON.parse(body.result.content[0].text);
    expect(agentResult).toMatchObject({ status: "pending", id: "a2" });
  });

  it("submit_blog_post with a valid identity queues a blog post and returns a pending receipt", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 54,
        method: "tools/call",
        params: {
          name: "submit_blog_post",
          arguments: {
            title: "Post Title",
            excerpt: "Short excerpt",
            content: "Full blog content here...",
            readTime: "3 min",
            publishedAt: "2026-08-10",
            imageUrl: "https://images.unsplash.com/photo-123",
            category: "Agents",
          },
        },
      })
    );
    const body = await res.json();
    expect(db.createBlogPost).toHaveBeenCalled();
    const blogResult = JSON.parse(body.result.content[0].text);
    expect(blogResult).toMatchObject({ status: "pending", id: "b1" });
  });

  it("submit_agent rejects installCommand with shell metacharacters", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 55,
        method: "tools/call",
        params: {
          name: "submit_agent",
          arguments: {
            name: "Evil Tool",
            category: "CLI",
            description: "A tool that chains commands",
            installCommand: "npx tool; rm -rf /",
          },
        },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
    expect(db.createAgent).not.toHaveBeenCalled();
  });

  it("create_forum_thread creates a forum thread", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 56,
        method: "tools/call",
        params: {
          name: "create_forum_thread",
          arguments: {
            title: "Discussion Title",
            category: "General",
            content: "This is a meaningful question or discussion prompt.",
          },
        },
      })
    );
    const body = await res.json();
    expect(db.createThread).toHaveBeenCalledWith(
      "Discussion Title",
      "agent_abc123",
      "General",
      "This is a meaningful question or discussion prompt.",
      MOCK_IDENTITY.botAuth
    );
    const threadResult = JSON.parse(body.result.content[0].text);
    expect(threadResult).toMatchObject({ id: "t2", title: "New Thread" });
  });

  it("reply_to_thread adds a reply to a thread", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 57,
        method: "tools/call",
        params: {
          name: "reply_to_thread",
          arguments: { threadId: "t1", content: "Great suggestion, trying it now!" },
        },
      })
    );
    const body = await res.json();
    expect(db.addReply).toHaveBeenCalledWith("t1", "agent_abc123", "Great suggestion, trying it now!", MOCK_IDENTITY.botAuth);
    const result = JSON.parse(body.result.content[0].text);
    expect(result.id).toBe("t1");
  });

  it("upvote_skill succeeds", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 58, method: "tools/call", params: { name: "upvote_skill", arguments: { skillId: "s_123" } } })
    );
    const body = await res.json();
    expect(db.upvoteSkill).toHaveBeenCalledWith("s_123", MOCK_IDENTITY.botAuth);
    expect(JSON.parse(body.result.content[0].text)).toEqual({ upvotes: 7 });
  });

  it("upvote_vibe succeeds", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 59, method: "tools/call", params: { name: "upvote_vibe", arguments: { vibeId: "p_123" } } })
    );
    const body = await res.json();
    expect(db.upvoteProject).toHaveBeenCalledWith("p_123", MOCK_IDENTITY.botAuth);
    expect(JSON.parse(body.result.content[0].text)).toEqual({ upvotes: 10 });
  });

  it("upvote_agent succeeds", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 60, method: "tools/call", params: { name: "upvote_agent", arguments: { agentId: "a_123" } } })
    );
    const body = await res.json();
    expect(db.upvoteAgent).toHaveBeenCalledWith("a_123", MOCK_IDENTITY.botAuth);
    expect(JSON.parse(body.result.content[0].text)).toEqual({ upvotes: 4 });
  });

  it("upvote_thread succeeds", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 61, method: "tools/call", params: { name: "upvote_thread", arguments: { threadId: "t_123" } } })
    );
    const body = await res.json();
    expect(db.upvoteThread).toHaveBeenCalledWith("t_123", MOCK_IDENTITY.botAuth);
    expect(JSON.parse(body.result.content[0].text)).toEqual({ upvotes: 5 });
  });

  it("upvote_reply succeeds", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 62, method: "tools/call", params: { name: "upvote_reply", arguments: { replyId: "r_123", threadId: "t_123" } } })
    );
    const body = await res.json();
    expect(db.upvoteReply).toHaveBeenCalledWith("r_123", "t_123", MOCK_IDENTITY.botAuth);
    expect(JSON.parse(body.result.content[0].text)).toEqual({ upvotes: 3 });
  });

  it("passes explicit authToken from arguments to resolveRequestIdentity", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 63,
        method: "tools/call",
        params: {
          name: "upvote_thread",
          arguments: { threadId: "t_123", authToken: "my-token-123" },
        },
      })
    );
    const body = await res.json();
    expect(resolveRequestIdentity).toHaveBeenCalledWith(expect.any(Request), "my-token-123");
    expect(JSON.parse(body.result.content[0].text)).toEqual({ upvotes: 5 });
  });

  it("returns invalid request error when unauthenticated with instructions", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(null);
    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 64,
        method: "tools/call",
        params: { name: "submit_skill", arguments: { title: "X", category: "backend-data", githubUrl: "https://x.com" } },
      })
    );
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("request_agent_auth");
  });

  it("returns NOT_FOUND (-32001) when upvoted target does not exist", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(db.upvoteSkill).mockResolvedValueOnce(null as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 65, method: "tools/call", params: { name: "upvote_skill", arguments: { skillId: "s_missing" } } })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
  });

  it("returns SERVICE_UNAVAILABLE (-32002) when DB upvote RPC fails", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(db.upvoteSkill).mockResolvedValueOnce("rpc_error" as never);
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 66, method: "tools/call", params: { name: "upvote_skill", arguments: { skillId: "s_1" } } })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32002);
  });

  it("rejects write tools when agent write budget is exhausted (-32003)", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(MOCK_IDENTITY as never);
    vi.mocked(resolveAgentWriteLimit).mockResolvedValueOnce("rate_limited");

    const res = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 67,
        method: "tools/call",
        params: {
          name: "submit_skill",
          arguments: { title: "New Skill", category: "backend-data", githubUrl: "https://github.com/x/y" },
        },
      })
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32003);
  });
});

describe("POST /api/mcp — rate limiting", () => {
  function rpcWithIp(payload: unknown, ip: string) {
    return new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": ip,
      },
      body: JSON.stringify(payload),
    });
  }

  it("checks rate limit using the correct hashed key", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const res = await POST(rpcWithIp({ jsonrpc: "2.0", id: 1, method: "initialize" }, "1.2.3.4"));
    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith("mcp:hashed:1.2.3.4", 60, 60);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const res = await POST(rpcWithIp({ jsonrpc: "2.0", id: 1, method: "initialize" }, "1.2.3.4"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
  });
});
