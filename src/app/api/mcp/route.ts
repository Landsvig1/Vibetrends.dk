import { NextResponse } from "next/server";
import {
  getSkills,
  getProjects,
  getAgents,
  getCli,
  parseSkillView,
  upvoteThread,
  upvoteReply,
  createSkill,
  createProject,
  addReply,
  createBlogPost,
  type Skill,
  type BlogPost,
  type ActingAs,
} from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { SKILL_CATEGORY_SLUGS, SKILL_CATEGORIES } from "@/lib/skillCategories";
import { FEED_TYPES } from "@/lib/feedTypes";
import { BLOG_CATEGORIES } from "@/lib/blogCategories";
import { isAllowedImageUrl } from "@/lib/allowedImageHosts";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/rate-limit";

const RATE_LIMIT_LIMIT = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Minimal MCP server over JSON-RPC 2.0 (Streamable HTTP transport, POST).
 * Read-only tools (search_*, list_*) require no authentication. Write tools
 * (upvote_thread, upvote_reply, submit_skill, submit_project, reply_to_thread,
 * submit_blog_post) require an `Authorization: Bearer <access_token>` header
 * on the HTTP request, resolved via `resolveRequestIdentity()` — the same
 * bearer-token mechanism already used by /api/vibes, /api/skills, /api/forum,
 * and /api/blog. A token can come from a real Supabase session or from
 * `POST /api/agentauth` (self-service, no signup). See
 * docs/decisions/2026-06-19-agent-auth.md for the superseded original design.
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
          enum: [...SKILL_CATEGORY_SLUGS],
          description: "Valgfri kategori-filtrering (vibetrends' egen skills-taksonomi)",
        },
        view: {
          type: "string",
          enum: ["danish", "hot", "trending"],
          description: "Valgfri visning: danish (skills fra danske bidragydere), hot (seneste momentum) eller trending. Udelad for hele kataloget.",
        },
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
      },
    },
  },
  {
    name: "search_vibes",
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
      "Find feed-elementer (CLI'er) i kataloget. Hosts (Claude Code, Cursor, Gemini) er forbindelsesmål og returneres aldrig som katalog-resultater. Alias for search_cli.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søgeterm" },
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
      },
    },
  },
  {
    name: "search_cli",
    description: "Søg i CLI-feedet — CLI-værktøjer en agent kan kalde. Hosts udelades.",
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
    description: "Vis feed-typerne (skills, MCP-servere, CLI'er) — kapabiliteter du kobler på en host. Samme feed-vs-host-taksonomi som navigationen.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "upvote_thread",
    description: "Stem op på en forumtråd. Kræver Authorization: Bearer <access_token> (se POST /api/agentauth).",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Tråd-id, fx 't_1234567890'" },
      },
      required: ["threadId"],
    },
  },
  {
    name: "upvote_reply",
    description: "Stem op på et forumsvar. Kræver Authorization: Bearer <access_token> (se POST /api/agentauth).",
    inputSchema: {
      type: "object",
      properties: {
        replyId: { type: "string", description: "Svar-id, fx 'r_1234567890'" },
        threadId: { type: "string", description: "Valgfrit forældre-tråd-id (undgår et ekstra opslag)" },
      },
      required: ["replyId"],
    },
  },
  {
    name: "reply_to_thread",
    description: "Tilføj et svar til en forumtråd. Kræver Authorization: Bearer <access_token> (se POST /api/agentauth).",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Tråd-id, fx 't_1234567890'" },
        content: { type: "string", description: "Svarets indhold (1-5000 tegn)" },
      },
      required: ["threadId", "content"],
    },
  },
  {
    name: "submit_skill",
    description: "Indsend en ny skill til biblioteket. Kræver Authorization: Bearer <access_token> (se POST /api/agentauth).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titel (1-100 tegn)" },
        category: { type: "string", enum: [...SKILL_CATEGORY_SLUGS], description: "Skill-kategori" },
        description: { type: "string", description: "Beskrivelse (op til 1000 tegn, valgfri)" },
        tags: { type: "array", items: { type: "string" }, description: "Op til 10 tags (valgfri)" },
        githubUrl: { type: "string", description: "URL til skillets repo" },
        source: { type: "string", description: "Valgfri kilde-URL (fx det oprindelige repo)" },
      },
      required: ["title", "category", "githubUrl"],
    },
  },
  {
    name: "submit_project",
    description: "Indsend et nyt vibe-projekt til showcase. Kræver Authorization: Bearer <access_token> (se POST /api/agentauth).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titel (1-100 tegn)" },
        description: { type: "string", description: "Beskrivelse (10-500 tegn)" },
        tools: { type: "array", items: { type: "string" }, description: "Op til 10 værktøjer brugt (valgfri)" },
        prompts: { type: "array", items: { type: "string" }, description: "Prompts brugt til at bygge projektet (valgfri)" },
        demoUrl: { type: "string", description: "Valgfri URL til den kørende demo" },
        githubUrl: { type: "string", description: "Valgfri URL til projektets repo" },
        imageUrl: { type: "string", description: "Valgfrit skærmbillede-URL (skal matche next.config.ts's tilladte billed-hosts)" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "submit_blog_post",
    description: "Indsend et nyt blogindlæg. Kræver Authorization: Bearer <access_token> (se POST /api/agentauth).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titel (1-200 tegn)" },
        excerpt: { type: "string", description: "Kort resumé (1-500 tegn)" },
        content: { type: "string", description: "Fuldt indhold (1-50000 tegn)" },
        readTime: { type: "string", description: "Estimeret læsetid, fx '4 min'" },
        publishedAt: { type: "string", description: "Udgivelsesdato" },
        imageUrl: { type: "string", description: "URL til artiklens billede" },
        category: { type: "string", enum: [...BLOG_CATEGORIES], description: "Blog-kategori" },
      },
      required: ["title", "excerpt", "content", "readTime", "publishedAt", "imageUrl", "category"],
    },
  },
] as const;

const WRITE_TOOLS = new Set([
  "upvote_thread",
  "upvote_reply",
  "reply_to_thread",
  "submit_skill",
  "submit_project",
  "submit_blog_post",
]);

// JSON-RPC 2.0 error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
// -32000 to -32099 is the JSON-RPC 2.0 reserved range for implementation-defined server errors.
const NOT_FOUND_ERROR = -32001;
const SERVICE_UNAVAILABLE_ERROR = -32002;

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

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

async function callTool(name: string, args: Record<string, unknown>, actingAs?: ActingAs, username?: string) {
  const query = asString(args.query);
  const lang = asLang(args.lang);
  switch (name) {
    case "upvote_thread": {
      const threadId = asString(args.threadId);
      if (!threadId) return { error: "INVALID_PARAMS", message: "threadId is required" };
      const upvotes = await upvoteThread(threadId, actingAs);
      if (upvotes === "rpc_error") return { error: "SERVICE_UNAVAILABLE", message: "Upvote service unavailable" };
      if (upvotes === null) return { error: "NOT_FOUND", message: `Thread not found: ${threadId}` };
      return textContent({ upvotes });
    }
    case "upvote_reply": {
      const replyId = asString(args.replyId);
      if (!replyId) return { error: "INVALID_PARAMS", message: "replyId is required" };
      const upvotes = await upvoteReply(replyId, asString(args.threadId), actingAs);
      if (upvotes === "rpc_error") return { error: "SERVICE_UNAVAILABLE", message: "Upvote service unavailable" };
      if (upvotes === null) return { error: "NOT_FOUND", message: `Reply not found: ${replyId}` };
      return textContent({ upvotes });
    }
    case "reply_to_thread": {
      const threadId = asString(args.threadId);
      const content = asString(args.content);
      if (!threadId || !content) {
        return { error: "INVALID_PARAMS", message: "threadId and content are required" };
      }
      const submitterUsername = username ?? "agent";
      const thread = await addReply(threadId, submitterUsername, content, actingAs);
      if (!thread) return { error: "NOT_FOUND", message: `Thread not found: ${threadId}` };
      return textContent(thread);
    }
    case "submit_skill": {
      const title = asString(args.title);
      const category = asString(args.category) as Skill["category"] | undefined;
      const githubUrl = asString(args.githubUrl);
      if (!title || !category || !githubUrl) {
        return { error: "INVALID_PARAMS", message: "title, category, and githubUrl are required" };
      }
      if (!SKILL_CATEGORY_SLUGS.includes(category)) {
        return { error: "INVALID_PARAMS", message: `category must be one of: ${SKILL_CATEGORY_SLUGS.join(", ")}` };
      }
      const submitterUsername = username ?? "agent";
      const skill = await createSkill(
        title,
        submitterUsername,
        asString(args.description) ?? "",
        category,
        asStringArray(args.tags),
        githubUrl,
        asString(args.source),
        actingAs
      );
      return textContent(skill);
    }
    case "submit_project": {
      // Required set mirrors projectSchema in src/app/api/vibes/route.ts — demoUrl
      // is optional there too; requiring it here would reject payloads REST accepts.
      const title = asString(args.title);
      const description = asString(args.description);
      if (!title || !description) {
        return { error: "INVALID_PARAMS", message: "title and description are required" };
      }
      const imageUrl = asString(args.imageUrl);
      if (imageUrl && !isAllowedImageUrl(imageUrl)) {
        return {
          error: "INVALID_PARAMS",
          message: "imageUrl host is not allowed (must match next.config.ts's image remotePatterns)",
        };
      }
      const submitterUsername = username ?? "agent";
      const project = await createProject(
        title,
        submitterUsername,
        description,
        asStringArray(args.tools),
        asStringArray(args.prompts),
        asString(args.demoUrl) ?? "",
        asString(args.githubUrl),
        imageUrl,
        actingAs
      );
      return textContent(project);
    }
    case "submit_blog_post": {
      const title = asString(args.title);
      const excerpt = asString(args.excerpt);
      const content = asString(args.content);
      const readTime = asString(args.readTime);
      const publishedAt = asString(args.publishedAt);
      const imageUrl = asString(args.imageUrl);
      const category = asString(args.category) as BlogPost["category"] | undefined;
      if (!title || !excerpt || !content || !readTime || !publishedAt || !imageUrl || !category) {
        return {
          error: "INVALID_PARAMS",
          message: "title, excerpt, content, readTime, publishedAt, imageUrl, and category are required",
        };
      }
      if (!BLOG_CATEGORIES.includes(category)) {
        return { error: "INVALID_PARAMS", message: `category must be one of: ${BLOG_CATEGORIES.join(", ")}` };
      }
      const submitterUsername = username ?? "agent";
      const post = await createBlogPost(title, excerpt, content, submitterUsername, readTime, publishedAt, imageUrl, category, actingAs);
      return textContent(post);
    }
    case "search_skills":
      return textContent(await getSkills(query, asString(args.category), lang, parseSkillView(args.view)));
    case "search_vibes":
      return textContent(await getProjects(query, lang));
    case "search_agents":
    case "search_cli":
      // Feed items only. getCli excludes Host (and MCP Server) rows, so
      // hosts never appear as catalog results.
      return textContent(await getCli(query, lang));
    case "search_mcp_servers":
      return textContent(await getAgents(query, "MCP Server", lang));
    case "list_topics":
      return textContent(
        SKILL_CATEGORIES.map((c) => ({
          slug: c.slug,
          labelDa: c.labelDa,
          labelEn: c.labelEn,
          descDa: c.descDa,
          descEn: c.descEn,
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
  const ip = getClientIp(request);
  const withinLimit = await checkRateLimit(
    `mcp:${hashIp(ip)}`,
    RATE_LIMIT_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS
  );
  if (!withinLimit) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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

      // KTD9: identity is resolved from the HTTP Authorization header on this
      // request, not from JSON-RPC params — the body has no natural place for
      // a bearer token. Read-only tools skip this entirely: no behavior or
      // latency change for existing callers with no Authorization header.
      let actingAs: ActingAs | undefined;
      let username: string | undefined;
      if (WRITE_TOOLS.has(name)) {
        const identity = await resolveRequestIdentity(request);
        if (!identity) {
          return rpcError(id, INVALID_REQUEST, `Authorization required for write tool: ${name}`);
        }
        // botAuth is only set for bearer-token (agent) callers; when undefined
        // (a real cookie session), the write functions' resolveActor() falls
        // back to resolving the cookie session itself — same pattern as the
        // REST write routes (e.g. src/app/api/vibes/route.ts).
        actingAs = identity.botAuth;
        username = identity.user.username;
      }

      const result = await callTool(name, args, actingAs, username);
      if (result === null) {
        return rpcError(id, METHOD_NOT_FOUND, `Unknown tool: ${name}`);
      }
      if (typeof result === "object" && result !== null && "error" in result) {
        const { error: errorKind, message } = result as { error: string; message: string };
        const code =
          errorKind === "INVALID_PARAMS" ? INVALID_PARAMS
          : errorKind === "SERVICE_UNAVAILABLE" ? SERVICE_UNAVAILABLE_ERROR
          : NOT_FOUND_ERROR;
        return rpcError(id, code, message);
      }
      return rpcResult(id, result);
    }

    return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method ?? "(none)"}`);
  } catch {
    return rpcError(id, INTERNAL_ERROR, "Internal error");
  }
}
