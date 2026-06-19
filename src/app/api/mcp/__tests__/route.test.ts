import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getSkills: vi.fn(async () => [{ id: "s1", title: "Skill One" }]),
  getProjects: vi.fn(async () => [{ id: "p1", title: "Project One" }]),
  getAgents: vi.fn(async () => [{ id: "a1", name: "Agent One" }]),
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
    expect(body.protocolVersion).toBeTruthy();
    expect(body.tools).toHaveLength(3);
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

  it("tools/list returns the three tools with an inputSchema", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "search_skills",
      "search_showcase",
      "search_agents",
    ]);
    expect(body.result.tools[0].inputSchema.type).toBe("object");
  });

  it("tools/call search_skills returns results as text content", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_skills", arguments: { query: "ai" } } })
    );
    const body = await res.json();
    expect(db.getSkills).toHaveBeenCalledWith("ai", undefined);
    expect(body.result.content[0].type).toBe("text");
    expect(JSON.parse(body.result.content[0].text)).toEqual([{ id: "s1", title: "Skill One" }]);
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
