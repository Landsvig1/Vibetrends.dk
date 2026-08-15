import { NextResponse } from "next/server";
import {
  getSkills,
  getProjects,
  getAgents,
  getCli,
  getThreads,
  parseSkillView,
  upvoteThread,
  upvoteReply,
  upvoteSkill,
  upvoteProject,
  upvoteAgent,
  createSkill,
  createProject,
  createAgent,
  createThread,
  addReply,
  createBlogPost,
  getFeedItems,
  type ActingAs,
  type FeedItemType,
} from "@/lib/db";
import { resolveRequestIdentity, supabasePublic } from "@/lib/supabase-server";
import { pendingSubmissionBody, reviewStateForWrite } from "@/lib/reviewGate";
import { resolveAgentWriteLimit, checkRateLimit, getClientIp, hashIp } from "@/lib/rate-limit";
import { SKILL_CATEGORY_SLUGS, SKILL_CATEGORIES } from "@/lib/skillCategories";
import { FEED_TYPES } from "@/lib/feedTypes";
import { BLOG_CATEGORIES } from "@/lib/blogCategories";
import { FORUM_CATEGORY_KEYS } from "@/lib/forumCategories";
import {
  skillSchema,
  projectSchema,
  agentSchema,
  threadSchema,
  blogPostSchema,
  replySchema,
  formatZodError,
} from "@/lib/schemas";

const RATE_LIMIT_LIMIT = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Minimal MCP server over JSON-RPC 2.0 (Streamable HTTP transport, POST).
 * Read-only tools (search_*, list_*) require no authentication.
 * Write tools require authentication via `authToken` parameter in arguments
 * or an `Authorization: Bearer <access_token>` header on the HTTP request.
 * Agents can self-authenticate autonomously using the `request_agent_auth` tool.
 */

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "search_skills",
    description:
      "Søg i biblioteket af AI-skills, workflows og scripts. Skills fra et repo med flere skills bærer collectionSlug og collectionTitle; det er herkomst, ikke en gruppering, så hver skill er stadig sin egen installerbare post.",
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
    name: "search_forum",
    description: "Søg i forumtråde eller filtrer efter kategori.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Valgfri søgeterm i titel og indhold" },
        category: {
          type: "string",
          enum: [...FORUM_CATEGORY_KEYS],
          description: "Valgfri forumkategori",
        },
        sort: {
          type: "string",
          enum: ["new", "top"],
          description: "Sortering: 'new' (nyeste først) eller 'top' (flest stemmer først, standard)",
        },
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
    name: "get_market_updates",
    description:
      "Hent hvad der er nyt på det danske AI-marked siden et tidspunkt: nye skills, MCP-servere, CLI-tools og showcase-projekter i én omvendt kronologisk strøm. Beregnet til periodisk polling — send 'since' med tidspunktet for dit seneste kald.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "ISO 8601-tidspunkt; kun elementer publiceret efter dette. Udelad for de seneste elementer." },
        types: {
          type: "array",
          items: { type: "string", enum: ["skill", "mcp", "cli", "vibe"] },
          description: "Valgfri filtrering på indholdstyper (standard: alle)",
        },
        lang: { type: "string", enum: ["da", "en"], description: "Sprog for resultater (standard: da)" },
        limit: { type: "number", description: "Maks. antal elementer, 1-100 (standard: 50)" },
      },
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
    name: "request_agent_auth",
    description:
      "Anmod om en midlertidig agent-identitet (access_token) til brug ved skrivehandlinger. " +
      "Returnerer access_token og refresh_token. Send access_token som 'authToken' i efterfølgende skriveværktøjer eller som HTTP Authorization: Bearer <token> header.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "upvote_skill",
    description: "Stem op på en skill. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth).",
    inputSchema: {
      type: "object",
      properties: {
        skillId: { type: "string", description: "Skill-id eller slug, fx 's_1234567890'" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["skillId"],
    },
  },
  {
    name: "upvote_vibe",
    description: "Stem op på et vibe-projekt. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth).",
    inputSchema: {
      type: "object",
      properties: {
        vibeId: { type: "string", description: "Vibe/projekt-id eller slug, fx 'p_1234567890'" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["vibeId"],
    },
  },
  {
    name: "upvote_agent",
    description: "Stem op på et CLI-værktøj eller en MCP-server. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth).",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent/værktøj-id eller slug, fx 'a_1234567890'" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "upvote_thread",
    description: "Stem op på en forumtråd. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth).",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Tråd-id, fx 't_1234567890'" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["threadId"],
    },
  },
  {
    name: "upvote_reply",
    description: "Stem op på et forumsvar. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth).",
    inputSchema: {
      type: "object",
      properties: {
        replyId: { type: "string", description: "Svar-id, fx 'r_1234567890'" },
        threadId: { type: "string", description: "Valgfrit forældre-tråd-id (undgår et ekstra opslag)" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["replyId"],
    },
  },
  {
    name: "create_forum_thread",
    description: "Opret en ny forumtråd. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Trådtitel (1-200 tegn)" },
        category: { type: "string", enum: [...FORUM_CATEGORY_KEYS], description: "Forumkategori" },
        content: { type: "string", description: "Trådens indhold (10-5000 tegn)" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["title", "category", "content"],
    },
  },
  {
    name: "reply_to_thread",
    description: "Tilføj et svar til en forumtråd. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth).",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Tråd-id, fx 't_1234567890'" },
        content: { type: "string", description: "Svarets indhold (1-5000 tegn)" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["threadId", "content"],
    },
  },
  {
    name: "submit_skill",
    description:
      "Indsend en ny skill til biblioteket. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth). " +
      "Bidraget sættes i kø til gennemsyn og er ikke offentligt, før et menneske har godkendt det — svaret er en pending-kvittering, ikke selve posten.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titel (1-100 tegn)" },
        category: { type: "string", enum: [...SKILL_CATEGORY_SLUGS], description: "Skill-kategori" },
        description: { type: "string", description: "Beskrivelse (op til 1000 tegn, valgfri)" },
        tags: { type: "array", items: { type: "string" }, description: "Op til 10 tags (valgfri)" },
        githubUrl: { type: "string", description: "URL til skillets repo" },
        source: { type: "string", description: "Valgfri kilde-URL (fx det oprindelige repo)" },
        descriptionDa: { type: "string", description: "Valgfri dansk oversættelse af beskrivelsen" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["title", "category", "githubUrl"],
    },
  },
  {
    name: "submit_project",
    description:
      "Indsend et nyt vibe-projekt til showcase. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth). " +
      "Bidraget sættes i kø til gennemsyn og er ikke offentligt, før et menneske har godkendt det — svaret er en pending-kvittering, ikke selve posten.",
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
        descriptionDa: { type: "string", description: "Valgfri dansk oversættelse af beskrivelsen" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "submit_agent",
    description:
      "Indsend et nyt CLI-værktøj eller en MCP-server til kataloget. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth). " +
      "Bidraget sættes i kø til gennemsyn og er ikke offentligt, før et menneske har godkendt det — svaret er en pending-kvittering, ikke selve posten.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Titel / værktøjsnavn (1-100 tegn)" },
        category: { type: "string", enum: ["CLI", "MCP Server"], description: "Værktøjskategori" },
        description: { type: "string", description: "Beskrivelse (10-500 tegn)" },
        installCommand: { type: "string", description: "Valgfri installations-/kørselskommando (fx 'npx my-tool')" },
        systemPrompt: { type: "string", description: "Valgfri system prompt (op til 10000 tegn)" },
        tags: { type: "array", items: { type: "string" }, description: "Op til 10 tags (valgfri)" },
        sourceUrl: { type: "string", description: "Valgfri URL til kilderepo/website" },
        descriptionDa: { type: "string", description: "Valgfri dansk oversættelse af beskrivelsen" },
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["name", "category", "description"],
    },
  },
  {
    name: "submit_blog_post",
    description:
      "Indsend et nyt blogindlæg. Kræver authToken eller Authorization: Bearer <access_token> (se request_agent_auth). " +
      "Bidraget sættes i kø til gennemsyn og er ikke offentligt, før et menneske har godkendt det — svaret er en pending-kvittering, ikke selve posten.",
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
        authToken: { type: "string", description: "Valgfrit access-token fra request_agent_auth eller /api/agentauth" },
      },
      required: ["title", "excerpt", "content", "readTime", "publishedAt", "imageUrl", "category"],
    },
  },
] as const;

const WRITE_TOOLS = new Set([
  "upvote_skill",
  "upvote_vibe",
  "upvote_project",
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

// JSON-RPC 2.0 error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
// -32000 to -32099 is the JSON-RPC 2.0 reserved range for implementation-defined server errors.
const NOT_FOUND_ERROR = -32001;
const SERVICE_UNAVAILABLE_ERROR = -32002;
const RATE_LIMITED_ERROR = -32003;

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

async function callTool(
  name: string,
  args: Record<string, unknown>,
  actingAs?: ActingAs,
  username?: string,
  request?: Request
) {
  const query = asString(args.query);
  const lang = asLang(args.lang);
  switch (name) {
    case "request_agent_auth": {
      const ip = request ? getClientIp(request) : "127.0.0.1";
      const withinLimit = await checkRateLimit(
        `agentauth:${hashIp(ip)}`,
        5,
        60 * 60
      );
      if (!withinLimit) {
        return { error: "RATE_LIMITED", message: "Too many auth requests from this IP. Limit is 5 per hour." };
      }
      const agentId = crypto.randomUUID().slice(0, 8);
      const { data, error } = await supabasePublic.auth.signInAnonymously({
        options: { data: { full_name: `agent_${agentId}` } },
      });
      if (error || !data.session) {
        return {
          error: "SERVICE_UNAVAILABLE",
          message: "Failed to provision agent identity. If this persists, anonymous sign-in may not be enabled on this Supabase project.",
        };
      }
      return textContent({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        token_type: "bearer",
        expires_in: data.session.expires_in,
        instructions: "Send 'access_token' as 'authToken' in write tools or pass Authorization: Bearer <token> in HTTP headers.",
      });
    }
    case "upvote_skill": {
      const skillId = asString(args.skillId) || asString(args.id);
      if (!skillId) return { error: "INVALID_PARAMS", message: "skillId is required" };
      const upvotes = await upvoteSkill(skillId, actingAs);
      if (upvotes === "rpc_error") return { error: "SERVICE_UNAVAILABLE", message: "Upvote service unavailable" };
      if (upvotes === null) return { error: "NOT_FOUND", message: `Skill not found: ${skillId}` };
      return textContent({ upvotes });
    }
    case "upvote_vibe":
    case "upvote_project": {
      const vibeId = asString(args.vibeId) || asString(args.projectId) || asString(args.id);
      if (!vibeId) return { error: "INVALID_PARAMS", message: "vibeId is required" };
      const upvotes = await upvoteProject(vibeId, actingAs);
      if (upvotes === "rpc_error") return { error: "SERVICE_UNAVAILABLE", message: "Upvote service unavailable" };
      if (upvotes === null) return { error: "NOT_FOUND", message: `Project not found: ${vibeId}` };
      return textContent({ upvotes });
    }
    case "upvote_agent": {
      const agentId = asString(args.agentId) || asString(args.id);
      if (!agentId) return { error: "INVALID_PARAMS", message: "agentId is required" };
      const upvotes = await upvoteAgent(agentId, actingAs);
      if (upvotes === "rpc_error") return { error: "SERVICE_UNAVAILABLE", message: "Upvote service unavailable" };
      if (upvotes === null) return { error: "NOT_FOUND", message: `Agent not found: ${agentId}` };
      return textContent({ upvotes });
    }
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
    case "create_forum_thread": {
      const parsed = threadSchema.safeParse(args);
      if (!parsed.success) {
        return { error: "INVALID_PARAMS", message: `Invalid input: ${formatZodError(parsed.error)}` };
      }
      const { title, category, content } = parsed.data;
      const submitterUsername = username ?? "agent";
      const thread = await createThread(title, submitterUsername, category, content, actingAs);
      if (reviewStateForWrite("forum_threads", Boolean(actingAs)) === "pending") {
        return textContent(pendingSubmissionBody(thread.id));
      }
      return textContent(thread);
    }
    case "reply_to_thread": {
      const threadId = asString(args.threadId);
      if (!threadId) {
        return { error: "INVALID_PARAMS", message: "threadId is required" };
      }
      const parsed = replySchema.safeParse(args);
      if (!parsed.success) {
        return { error: "INVALID_PARAMS", message: `Invalid input: ${formatZodError(parsed.error)}` };
      }
      const { content } = parsed.data;
      const submitterUsername = username ?? "agent";
      const added = await addReply(threadId, submitterUsername, content, actingAs);
      if (!added) return { error: "NOT_FOUND", message: `Thread not found: ${threadId}` };
      if (reviewStateForWrite("forum_replies", Boolean(actingAs)) === "pending") {
        return textContent(pendingSubmissionBody(added.replyId));
      }
      return textContent(added.thread);
    }
    case "submit_skill": {
      const parsed = skillSchema.safeParse(args);
      if (!parsed.success) {
        return { error: "INVALID_PARAMS", message: `Invalid input: ${formatZodError(parsed.error)}` };
      }
      const { title, category, description, tags, githubUrl, source, descriptionDa } = parsed.data;
      const submitterUsername = username ?? "agent";
      const skill = await createSkill(
        title,
        submitterUsername,
        description || "",
        category,
        tags || [],
        githubUrl,
        source || undefined,
        descriptionDa || undefined,
        actingAs
      );
      if (reviewStateForWrite("skills", Boolean(actingAs)) === "pending") {
        return textContent(pendingSubmissionBody(skill.id));
      }
      return textContent(skill);
    }
    case "submit_project": {
      const parsed = projectSchema.safeParse(args);
      if (!parsed.success) {
        return { error: "INVALID_PARAMS", message: `Invalid input: ${formatZodError(parsed.error)}` };
      }
      const { title, description, tools, prompts, demoUrl, githubUrl, imageUrl, descriptionDa } = parsed.data;
      const submitterUsername = username ?? "agent";
      const project = await createProject(
        title,
        submitterUsername,
        description,
        tools || [],
        prompts || [],
        demoUrl || "",
        githubUrl,
        imageUrl || undefined,
        descriptionDa || undefined,
        actingAs
      );
      if (reviewStateForWrite("vibes", Boolean(actingAs)) === "pending") {
        return textContent(pendingSubmissionBody(project.id));
      }
      return textContent(project);
    }
    case "submit_agent": {
      const parsed = agentSchema.safeParse(args);
      if (!parsed.success) {
        return { error: "INVALID_PARAMS", message: `Invalid input: ${formatZodError(parsed.error)}` };
      }
      const { name: agentName, category, description, installCommand, systemPrompt, tags, sourceUrl, descriptionDa } = parsed.data;
      const submitterUsername = username ?? "agent";
      const agent = await createAgent(
        agentName,
        submitterUsername,
        category,
        description,
        installCommand || "",
        systemPrompt || "",
        tags || [],
        sourceUrl || undefined,
        descriptionDa || undefined,
        actingAs
      );
      if (reviewStateForWrite("agents", Boolean(actingAs)) === "pending") {
        return textContent(pendingSubmissionBody(agent.id));
      }
      return textContent(agent);
    }
    case "submit_blog_post": {
      const parsed = blogPostSchema.safeParse(args);
      if (!parsed.success) {
        return { error: "INVALID_PARAMS", message: `Invalid input: ${formatZodError(parsed.error)}` };
      }
      const { title, excerpt, content, readTime, publishedAt, imageUrl, category } = parsed.data;
      const submitterUsername = username ?? "agent";
      const post = await createBlogPost(
        title,
        excerpt,
        content,
        submitterUsername,
        readTime,
        publishedAt,
        imageUrl,
        category,
        actingAs
      );
      if (reviewStateForWrite("blog_posts", Boolean(actingAs)) === "pending") {
        return textContent(pendingSubmissionBody(post.id));
      }
      return textContent(post);
    }
    case "search_skills":
      return textContent(await getSkills(query, asString(args.category), lang, parseSkillView(args.view)));
    case "search_vibes":
      return textContent(await getProjects(query, lang));
    case "search_agents":
    case "search_cli":
      return textContent(await getCli(query, lang));
    case "search_mcp_servers":
      return textContent(await getAgents(query, "MCP Server", lang));
    case "search_forum": {
      const search = query;
      const category = asString(args.category);
      const sort = args.sort === "new" ? "new" : "top";
      const threads = await getThreads({ search, category, lang, sort });
      return textContent(threads);
    }
    case "get_market_updates": {
      const since = asString(args.since);
      if (since && Number.isNaN(Date.parse(since))) {
        return { error: "INVALID_PARAMS", message: "Invalid 'since' — expected an ISO 8601 timestamp" };
      }
      const validTypes: FeedItemType[] = ["skill", "mcp", "cli", "vibe"];
      let types: FeedItemType[] | undefined;
      if (Array.isArray(args.types)) {
        const requested = args.types.filter((t): t is string => typeof t === "string");
        const invalid = requested.filter(t => !validTypes.includes(t as FeedItemType));
        if (invalid.length > 0) {
          return { error: "INVALID_PARAMS", message: `Invalid types: ${invalid.join(", ")}. Valid: ${validTypes.join(", ")}` };
        }
        types = requested as FeedItemType[];
      }
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const items = await getFeedItems({ since, types, lang, limit });
      return textContent({ generatedAt: new Date().toISOString(), count: items.length, items });
    }
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

      let actingAs: ActingAs | undefined;
      let username: string | undefined;
      if (WRITE_TOOLS.has(name)) {
        const explicitToken = typeof args.authToken === "string" && args.authToken.trim() ? args.authToken.trim() : undefined;
        const identity = await resolveRequestIdentity(request, explicitToken);
        if (!identity) {
          return rpcError(
            id,
            INVALID_REQUEST,
            `Authorization required for write tool: ${name}. Call request_agent_auth to get an access_token, or pass Authorization: Bearer <token>.`
          );
        }
        actingAs = identity.botAuth;
        username = identity.user.username;

        if (actingAs) {
          const outcome = await resolveAgentWriteLimit(actingAs.user.id);
          if (outcome === "service_unavailable") {
            return rpcError(id, SERVICE_UNAVAILABLE_ERROR, "Service unavailable");
          }
          if (outcome === "rate_limited") {
            return rpcError(id, RATE_LIMITED_ERROR, `Write rate limit exceeded for tool: ${name}`);
          }
        }
      }

      const result = await callTool(name, args, actingAs, username, request);
      if (result === null) {
        return rpcError(id, METHOD_NOT_FOUND, `Unknown tool: ${name}`);
      }
      if (typeof result === "object" && result !== null && "error" in result) {
        const { error: errorKind, message } = result as { error: string; message: string };
        const code =
          errorKind === "INVALID_PARAMS" ? INVALID_PARAMS
          : errorKind === "SERVICE_UNAVAILABLE" ? SERVICE_UNAVAILABLE_ERROR
          : errorKind === "RATE_LIMITED" ? RATE_LIMITED_ERROR
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
