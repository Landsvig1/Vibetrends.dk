import { NextResponse } from "next/server";
import { getSkills, getProjects, getAgents } from "@/lib/db";

/**
 * Minimal MCP server over JSON-RPC 2.0 (Streamable HTTP transport, POST).
 * Read-only tools backed by the directory data layer. Write tools (upvote /
 * submit / reply) are deferred pending the agent-auth decision — today's auth is
 * the human session cookie, which agents do not carry. See
 * docs/decisions/2026-06-19-agent-auth.md.
 */

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "search_skills",
    description: "Søg i biblioteket af AI-skills, workflows og scripts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søgeterm" },
        category: {
          type: "string",
          enum: ["Prompting", "Agents", "Automation", "Fullstack"],
          description: "Valgfri kategori-filtrering",
        },
      },
    },
  },
  {
    name: "search_showcase",
    description: "Udforsk projekter bygget med AI og se deres prompts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søgeterm" },
      },
    },
  },
  {
    name: "search_agents",
    description: "Find MCP servere og AI agenter i kartoteket.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søgeterm" },
      },
    },
  },
] as const;

// JSON-RPC 2.0 error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type JsonRpcId = string | number | null;

function rpcResult(id: JsonRpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

function textContent(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_skills":
      return textContent(
        await getSkills(args.query as string | undefined, args.category as string | undefined)
      );
    case "search_showcase":
      return textContent(await getProjects(args.query as string | undefined));
    case "search_agents":
      return textContent(await getAgents(args.query as string | undefined));
    default:
      return null;
  }
}

// Lightweight, non-protocol discovery endpoint for humans/debugging.
export async function GET() {
  return NextResponse.json({
    name: "vibetrends-mcp",
    version: "1.0.0",
    protocolVersion: PROTOCOL_VERSION,
    transport: "Send JSON-RPC 2.0 requests via POST (initialize, tools/list, tools/call).",
    tools: TOOLS,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, PARSE_ERROR, "Parse error");
  }

  if (typeof body !== "object" || body === null || (body as { jsonrpc?: string }).jsonrpc !== "2.0") {
    return rpcError(null, INVALID_REQUEST, "Invalid Request: expected JSON-RPC 2.0");
  }

  const { id = null, method, params } = body as {
    id?: JsonRpcId;
    method?: string;
    params?: Record<string, unknown>;
  };

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "vibetrends-mcp", version: "1.0.0" },
      });
    }

    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const name = params?.name as string | undefined;
      const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
      if (!name) {
        return rpcError(id, INVALID_PARAMS, "Invalid params: missing tool name");
      }
      const result = await callTool(name, args);
      if (result === null) {
        return rpcError(id, METHOD_NOT_FOUND, `Unknown tool: ${name}`);
      }
      return rpcResult(id, result);
    }

    return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method ?? "(none)"}`);
  } catch {
    return rpcError(id, INTERNAL_ERROR, "Internal error");
  }
}
