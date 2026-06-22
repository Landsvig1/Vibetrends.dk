import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(async () => [{ id: "s1", title: "Skill One" }]),
  getProjects: vi.fn(async () => [{ id: "p1", title: "Project One" }]),
  getAgents: vi.fn(async () => [{ id: "m1", name: "MCP One" }]),
  getToolClis: vi.fn(async () => [{ id: "a1", name: "Tool CLI One" }]),
  parseSkillView: (v: unknown) => (v === "hot" || v === "trending" ? v : undefined),
}));

import { POST, GET } from "@/app/api/mcp/route";
import * as db from "@/lib/db";

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
    expect(body.tools).toHaveLength(7);
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
      "search_showcase",
      "search_agents",
      "search_tool_clis",
      "search_mcp_servers",
      "list_topics",
      "list_feed_types",
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

  it("tools/call search_showcase dispatches to getProjects", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "search_showcase", arguments: { query: "x" } } })
    );
    const body = await res.json();
    expect(db.getProjects).toHaveBeenCalledWith("x", "da");
    expect(body.result.content[0].type).toBe("text");
  });

  it("tools/call search_agents dispatches to getToolClis (feed items only, no hosts)", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 32, method: "tools/call", params: { name: "search_agents", arguments: {} } })
    );
    const body = await res.json();
    // getToolClis excludes Host (and MCP Server) rows, so hosts never surface.
    expect(db.getToolClis).toHaveBeenCalledWith(undefined, "da");
    expect(db.getAgents).not.toHaveBeenCalled();
    expect(body.result.content[0].type).toBe("text");
  });

  it("tools/call search_tool_clis dispatches to getToolClis", async () => {
    await POST(
      rpc({ jsonrpc: "2.0", id: 39, method: "tools/call", params: { name: "search_tool_clis", arguments: { query: "scrape" } } })
    );
    expect(db.getToolClis).toHaveBeenCalledWith("scrape", "da");
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
    expect(feedTypes.map((f: { slug: string }) => f.slug)).toEqual(["skills", "mcp-servers", "tool-clis"]);
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

  it("tools/call list_topics returns the 8-topic taxonomy as text content", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 38, method: "tools/call", params: { name: "list_topics", arguments: {} } })
    );
    const body = await res.json();
    const topics = JSON.parse(body.result.content[0].text);
    expect(topics).toHaveLength(8);
    expect(topics.map((t: { slug: string }) => t.slug)).toContain("nextjs");
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
