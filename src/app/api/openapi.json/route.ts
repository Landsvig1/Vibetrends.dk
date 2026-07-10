import { NextResponse } from "next/server";
import { BLOG_CATEGORIES } from "@/lib/blogCategories";

/**
 * Hand-authored OpenAPI 3.1 document for the REST surface — a plain object
 * literal, matching this codebase's existing pattern for schema-like data
 * (see TOOLS in src/app/api/mcp/route.ts). The route surface is small and
 * stable enough that generation would be more machinery than the problem
 * needs (KTD10). MCP tool schemas live separately in /api/mcp's own
 * tools/list — this document covers REST only.
 *
 * Keep in sync manually when adding/changing a route under src/app/api/.
 */
const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "vibetrends.dk API",
    version: "1.0.0",
    description:
      "REST surface for vibetrends.dk's agent-native content catalog. Most write routes accept either a browser session cookie or an `Authorization: Bearer <token>` header — get a token with zero signup via POST /api/agentauth, or use a real Supabase session token. See /llms.txt and /api/mcp for the MCP JSON-RPC equivalent of these write operations.",
  },
  servers: [{ url: "https://vibetrends.dk" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "A Supabase access token — either a real user session or one minted via POST /api/agentauth. Resolved server-side via resolveRequestIdentity(); RLS (auth.uid() = user_id) still applies to every write.",
      },
    },
    responses: {
      Unauthorized: {
        description: "No valid session cookie or Authorization: Bearer token was found.",
        content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
      },
      BadRequest: {
        description: "Request body failed schema validation.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { error: { type: "string" }, details: { type: "array" } },
            },
          },
        },
      },
      Forbidden: {
        description: "Honeypot field was filled — request rejected as likely automated spam.",
        content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
      },
      NotFound: {
        description: "The requested resource does not exist.",
        content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
      },
      TooManyRequests: {
        description: "Rate limit exceeded for this IP (see POST /api/agentauth).",
        content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
      },
      ServiceUnavailable: {
        description: "A downstream dependency (e.g. Supabase) is unreachable, or a required feature (e.g. anonymous sign-in) is not enabled.",
        content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "Healthy" }, "503": { $ref: "#/components/responses/ServiceUnavailable" } },
      },
    },
    "/api/agentauth": {
      post: {
        summary: "Auto-provision a bearer token for a caller with no prior credentials",
        description:
          "No request body. Rate-limited by IP (see /llms.txt for the current limit). Returns a short-lived access token — never a refresh token.",
        responses: {
          "201": {
            description: "Token issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    access_token: { type: "string" },
                    token_type: { type: "string", enum: ["bearer"] },
                    expires_in: { type: "number" },
                  },
                },
              },
            },
          },
          "429": { $ref: "#/components/responses/TooManyRequests" },
          "503": { $ref: "#/components/responses/ServiceUnavailable" },
        },
      },
    },
    "/api/vibes": {
      get: { summary: "List showcase projects", parameters: [{ name: "search", in: "query", schema: { type: "string" } }, { name: "sort", in: "query", schema: { type: "string", enum: ["new", "top", "az"] } }], responses: { "200": { description: "OK" } } },
      post: {
        summary: "Submit a showcase project",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { type: "string", maxLength: 100 },
                  description: { type: "string", minLength: 10, maxLength: 500 },
                  tools: { type: "array", items: { type: "string" }, maxItems: 10 },
                  prompts: { type: "array", items: { type: "string" } },
                  demoUrl: { type: "string", format: "uri" },
                  githubUrl: { type: "string", format: "uri" },
                  imageUrl: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/skills": {
      get: { summary: "List skills", parameters: [{ name: "search", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string" } }, { name: "view", in: "query", schema: { type: "string", enum: ["danish", "hot", "trending"] } }], responses: { "200": { description: "OK" } } },
      post: {
        summary: "Submit a skill",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "category", "githubUrl"],
                properties: {
                  title: { type: "string", maxLength: 100 },
                  category: { type: "string" },
                  description: { type: "string", maxLength: 1000 },
                  tags: { type: "array", items: { type: "string" }, maxItems: 10 },
                  githubUrl: { type: "string", format: "uri" },
                  source: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/agents": {
      get: { summary: "List CLI tools, MCP servers, and hosts", parameters: [{ name: "search", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string", enum: ["CLI", "MCP Server", "Host"] } }], responses: { "200": { description: "OK" } } },
      post: {
        summary: "Submit a CLI tool or MCP server",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "category", "description"],
                properties: {
                  name: { type: "string", maxLength: 100 },
                  category: { type: "string", enum: ["CLI", "MCP Server"] },
                  description: { type: "string", minLength: 10, maxLength: 500 },
                  installCommand: { type: "string", maxLength: 300 },
                  systemPrompt: { type: "string" },
                  tags: { type: "array", items: { type: "string" }, maxItems: 10 },
                  sourceUrl: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cli": {
      get: { summary: "JSON feed of CLI tools (category=CLI subset of /api/agents)", parameters: [{ name: "search", in: "query", schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
    },
    "/api/mcp-servers": {
      get: { summary: "JSON feed of MCP servers (category=MCP Server subset of /api/agents)", parameters: [{ name: "search", in: "query", schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
    },
    "/api/forum": {
      get: { summary: "List forum threads", parameters: [{ name: "search", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string" } }, { name: "sort", in: "query", schema: { type: "string", enum: ["new", "top"] } }], responses: { "200": { description: "OK" } } },
      post: {
        summary: "Create a forum thread",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "category", "content"],
                properties: {
                  title: { type: "string", maxLength: 200 },
                  category: { type: "string" },
                  content: { type: "string", minLength: 10, maxLength: 5000 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/forum/{id}": {
      delete: {
        summary: "Delete a forum thread (owner or admin only)",
        description: "Cookie-session auth only — this route does not accept a bearer token. Deletion is intentionally not exposed to bearer-authenticated agent callers.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "401": { $ref: "#/components/responses/Unauthorized" }, "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/forum/{id}/replies": {
      post: {
        summary: "Reply to a forum thread",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string", minLength: 1, maxLength: 5000 } } } } },
        },
        responses: {
          "201": { description: "Created" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/forum/{id}/upvote": {
      post: {
        summary: "Upvote a forum thread",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/ServiceUnavailable" },
        },
      },
    },
    "/api/forum/{id}/replies/{replyId}/upvote": {
      post: {
        summary: "Upvote a forum reply",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "replyId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "OK" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/ServiceUnavailable" },
        },
      },
    },
    "/api/blog": {
      get: { summary: "List or fetch blog posts", parameters: [{ name: "id", in: "query", schema: { type: "string" } }], responses: { "200": { description: "OK" }, "404": { $ref: "#/components/responses/NotFound" } } },
      post: {
        summary: "Submit a blog post",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "excerpt", "content", "readTime", "publishedAt", "imageUrl", "category"],
                properties: {
                  title: { type: "string", maxLength: 200 },
                  excerpt: { type: "string", maxLength: 500 },
                  content: { type: "string", maxLength: 50000 },
                  readTime: { type: "string", maxLength: 50 },
                  publishedAt: { type: "string" },
                  imageUrl: { type: "string", format: "uri" },
                  category: { type: "string", enum: [...BLOG_CATEGORIES] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(OPENAPI_DOCUMENT);
}
