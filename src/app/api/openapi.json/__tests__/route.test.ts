import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/openapi.json/route";

const ROUTE_FILES_UNDER_TEST = [
  "/api/agentauth",
  "/api/blog",
  "/api/forum",
  "/api/forum/{id}",
  "/api/forum/{id}/replies",
  "/api/forum/{id}/upvote",
  "/api/forum/{id}/replies/{replyId}/upvote",
  "/api/skills",
  "/api/vibes",
  "/api/cli",
  "/api/mcp-servers",
  "/api/agents",
  "/api/health",
];

describe("GET /api/openapi.json", () => {
  it("returns 200 with an OpenAPI 3.1 document", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBeTruthy();
  });

  it("has a paths entry for every route this plan added or extended", async () => {
    const res = await GET();
    const body = await res.json();
    for (const path of ROUTE_FILES_UNDER_TEST) {
      expect(body.paths[path], `missing paths entry for ${path}`).toBeDefined();
    }
  });

  it("documents /api/agentauth as an unauthenticated POST returning an access token", async () => {
    const res = await GET();
    const body = await res.json();
    const agentauth = body.paths["/api/agentauth"].post;
    expect(agentauth.security).toBeUndefined();
    expect(agentauth.responses["201"]).toBeDefined();
    expect(agentauth.responses["429"]).toBeDefined();
  });

  it("documents every write route as requiring bearerAuth", async () => {
    const res = await GET();
    const body = await res.json();
    const writeRoutes: [string, string][] = [
      ["/api/vibes", "post"],
      ["/api/skills", "post"],
      ["/api/agents", "post"],
      ["/api/forum", "post"],
      ["/api/forum/{id}/replies", "post"],
      ["/api/forum/{id}/upvote", "post"],
      ["/api/blog", "post"],
    ];
    for (const [path, method] of writeRoutes) {
      const operation = body.paths[path][method];
      expect(operation.security, `${method.toUpperCase()} ${path} should require bearerAuth`).toEqual([{ bearerAuth: [] }]);
    }
  });

  it("does not claim bearer auth on DELETE /api/forum/{id} — that route is cookie-session only", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.paths["/api/forum/{id}"].delete.security).toBeUndefined();
  });

  it("documents 404 and 503 on the forum upvote routes, matching their actual error responses", async () => {
    const res = await GET();
    const body = await res.json();
    for (const path of ["/api/forum/{id}/upvote", "/api/forum/{id}/replies/{replyId}/upvote"]) {
      expect(body.paths[path].post.responses["404"], `${path} missing 404`).toBeDefined();
      expect(body.paths[path].post.responses["503"], `${path} missing 503`).toBeDefined();
    }
  });

  it("declares reusable error response components covering the shared error shapes", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.components.responses.Unauthorized).toBeDefined();
    expect(body.components.responses.BadRequest).toBeDefined();
    expect(body.components.responses.Forbidden).toBeDefined();
    expect(body.components.responses.NotFound).toBeDefined();
    expect(body.components.responses.TooManyRequests).toBeDefined();
    expect(body.components.responses.ServiceUnavailable).toBeDefined();
  });
});
