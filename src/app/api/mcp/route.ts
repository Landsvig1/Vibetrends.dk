import { NextResponse } from "next/server";
import { getSkills, getProjects, getAgents, getToolClis, parseSkillView } from "@/lib/db";
import { TOPIC_SLUGS, TOPICS } from "@/lib/topics";
import { FEED_TYPES } from "@/lib/feedTypes";

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
          enum: [...TOPIC_SLUGS],
          description: "Valgfri emne-filtrering (skills.sh topic-slug)",
        },
        view: {
          type: "string",
          enum: ["hot", "trending"],
          description: "Valgfri rangliste: hot (seneste momentum) eller trending. Udelad for hele kataloget.",
        },
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
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
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
      },
    },
  },
  {
    name: "search_agents",
    description:
      "Find feed-elementer (tool-CLI'er) i kataloget. Hosts (Claude Code, Cursor, Gemini) er forbindelsesmål og returneres aldrig som katalog-resultater. Alias for search_tool_clis.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søgeterm" },
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
      },
    },
  },
  {
    name: "search_tool_clis",
    description: "Søg i tool-CLI-feedet — CLI-værktøjer en agent kan kalde. Hosts udelades.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søgeterm" },
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
      },
    },
  },
  {
    name: "search_mcp_servers",
    description: "Søg i MCP-server-feedet — MCP-kapabiliteter ét trin fra din opsætning.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søgeterm" },
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
      },
    },
  },
  {
    name: "list_topics",
    description: "Vis de 8 emner i Skills-biblioteket med dansk/engelsk label, beskrivelse og slug — samme taksonomi som /skills-emnekortene.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_feed_types",
    description: "Vis feed-typerne (skills, MCP-servere, tool-CLI'er) — kapabiliteter du kobler på en host. Samme feed-vs-host-taksonomi som navigationen.",
    inputSchema: {
      type: "object",
      properties: {},
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

// Tool arguments arrive untyped from the client; coerce defensively so a
// malformed value yields an empty search rather than throwing into -32603.
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asLang(v: unknown): "da" | "en" {
  return v === "en" ? "en" : "da";
}

async function callTool(name: string, args: Record<string, unknown>) {
  const query = asString(args.query);
  const lang = asLang(args.lang);
  switch (name) {
    case "search_skills":
      return textContent(await getSkills(query, asString(args.category), lang, parseSkillView(args.view)));
    case "search_showcase":
      return textContent(await getProjects(query, lang));
    case "search_agents":
    case "search_tool_clis":
      // Feed items only. getToolClis excludes Host (and MCP Server) rows, so
      // hosts never appear as catalog results.
      return textContent(await getToolClis(query, lang));
    case "search_mcp_servers":
      return textContent(await getAgents(query, "MCP Server", lang));
    case "list_topics":
      return textContent(
        TOPICS.map((t) => ({
          slug: t.slug,
          labelDa: t.labelDa,
          labelEn: t.labelEn,
          descDa: t.descDa,
          descEn: t.descEn,
        })),
      );
    case "list_feed_types":
      return textContent(
        FEED_TYPES.map((f) => ({
          slug: f.slug,
          labelDa: f.labelDa,
          labelEn: f.labelEn,
          descDa: f.descDa,
          descEn: f.descEn,
          href: f.href,
        })),
      );
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

  // A JSON-RPC notification is a request with no `id` member (distinct from an
  // explicit null id). The spec — and the MCP handshake's notifications/initialized
  // — require the server to send no response. Acknowledge with 202, no body.
  const isNotification =
    !("id" in (body as object)) ||
    (typeof (body as { method?: unknown }).method === "string" &&
      (body as { method: string }).method.startsWith("notifications/"));
  if (isNotification) {
    return new NextResponse(null, { status: 202 });
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
