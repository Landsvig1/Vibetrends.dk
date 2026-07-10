import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// U3 — Forum API route integration tests for actingAs / bearer-token path
//
// Tests the route-handler layer: resolveRequestIdentity is mocked to return
// either a cookie-session identity (user only) or a bearer-bot identity
// (user + botAuth). The db functions are mocked to capture call arguments.
//
// Mirrors the pattern used in src/app/api/vibes/__tests__/route.test.ts but
// goes further: verifies that actingAs is threaded through from the route
// handler down to the db call, and that unauthenticated requests get 401.
// ---------------------------------------------------------------------------

// Mock the DB module — we verify call args, not actual DB behaviour.
vi.mock("@/lib/db", () => ({
  getThreads: vi.fn().mockResolvedValue([]),
  createThread: vi.fn(),
  addReply: vi.fn(),
  upvoteThread: vi.fn(),
  upvoteReply: vi.fn(),
}));

// Mock supabase-server: resolveRequestIdentity is the key seam.
vi.mock("@/lib/supabase-server", () => ({
  getAuthUser: vi.fn(),
  resolveBotRequestAuth: vi.fn(),
  resolveRequestIdentity: vi.fn(),
}));

// Mock next/headers (cookies) so route imports don't throw.
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

// Mock honeypot — always pass.
vi.mock("@/lib/honeypot", () => ({
  validateHoneypot: () => true,
}));

// Mock rate-limit — always within budget unless a test overrides it.
vi.mock("@/lib/rate-limit", () => ({
  checkAgentWriteAllowed: vi.fn().mockResolvedValue(true),
}));

import * as dbMod from "@/lib/db";
import * as serverMod from "@/lib/supabase-server";
import { checkAgentWriteAllowed } from "@/lib/rate-limit";
import type { ActingAs } from "@/lib/db";
import type { SupabaseClient } from "@supabase/supabase-js";

// Import the route handlers under test — must come after all vi.mock calls.
import { POST as forumPost } from "@/app/api/forum/route";
import { POST as repliesPost } from "@/app/api/forum/[id]/replies/route";
import { POST as threadUpvotePost } from "@/app/api/forum/[id]/upvote/route";
import { POST as replyUpvotePost } from "@/app/api/forum/[id]/replies/[replyId]/upvote/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/forum", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Synthetic ActingAs for a bearer-authenticated bot. */
function makeBotIdentity(userId = "bot-user-id"): {
  identity: Awaited<ReturnType<typeof serverMod.resolveRequestIdentity>>;
  actingAs: ActingAs;
} {
  const actingAs: ActingAs = {
    user: { id: userId, username: "testbot" },
    supabase: {} as unknown as SupabaseClient,
  };
  const identity = { user: actingAs.user, botAuth: actingAs };
  return { identity, actingAs };
}

/** Cookie-session identity — no botAuth. */
function makeCookieIdentity(username = "alice") {
  return { user: { id: "cookie-uid", username } };
}

const resolveRequestIdentityMock = vi.mocked(serverMod.resolveRequestIdentity);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: unauthenticated.
  resolveRequestIdentityMock.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// POST /api/forum (createThread)
// ---------------------------------------------------------------------------

describe("POST /api/forum — createThread via bearer token", () => {
  const validBody = { title: "My Thread", category: "General", content: "Content of the thread here." };

  it("returns 401 when resolveRequestIdentity returns null (no auth)", async () => {
    const res = await forumPost(makeRequest(validBody));
    expect(res.status).toBe(401);
    expect(vi.mocked(dbMod.createThread)).not.toHaveBeenCalled();
  });

  it("passes actingAs to createThread when bearer token present", async () => {
    const { identity, actingAs } = makeBotIdentity("bot-123");
    resolveRequestIdentityMock.mockResolvedValue(identity);
    vi.mocked(dbMod.createThread).mockResolvedValue({
      id: "t1", title: "My Thread", author: "testbot", category: "General",
      content: "Content of the thread here.", upvotes: 1, createdAt: "2026-01-01", replies: [],
      isDanish: false, denmarkSpecific: false,
    });

    const res = await forumPost(makeRequest(validBody));
    expect(res.status).toBe(201);

    const [, , , , calledActingAs] = vi.mocked(dbMod.createThread).mock.calls[0];
    expect(calledActingAs).toBe(actingAs);
  });

  it("passes undefined actingAs (cookie session) when no bearer token — backward compat", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity("alice"));
    vi.mocked(dbMod.createThread).mockResolvedValue({
      id: "t1", title: "My Thread", author: "alice", category: "General",
      content: "Content of the thread here.", upvotes: 1, createdAt: "2026-01-01", replies: [],
      isDanish: false, denmarkSpecific: false,
    });

    const res = await forumPost(makeRequest(validBody));
    expect(res.status).toBe(201);

    const [, , , , calledActingAs] = vi.mocked(dbMod.createThread).mock.calls[0];
    // botAuth is absent in a cookie-only identity, so actingAs is undefined.
    expect(calledActingAs).toBeUndefined();
  });

  it("returns 400 for invalid input (missing required field)", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity());
    // Missing 'content' which must be at least 10 chars.
    const res = await forumPost(makeRequest({ title: "T", category: "General" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(dbMod.createThread)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/forum/[id]/replies (addReply)
// ---------------------------------------------------------------------------

describe("POST /api/forum/[id]/replies — addReply via bearer token", () => {
  const validBody = { content: "A reply to this thread." };
  const params = Promise.resolve({ id: "t1" });

  it("returns 401 when unauthenticated", async () => {
    const res = await repliesPost(makeRequest(validBody), { params });
    expect(res.status).toBe(401);
  });

  it("passes actingAs to addReply when bearer token present", async () => {
    const { identity, actingAs } = makeBotIdentity("bot-456");
    resolveRequestIdentityMock.mockResolvedValue(identity);
    vi.mocked(dbMod.addReply).mockResolvedValue({
      id: "t1", title: "Thread", author: "a", category: "General",
      content: "c", upvotes: 1, createdAt: "2026-01-01", replies: [],
      isDanish: false, denmarkSpecific: false,
    });

    const res = await repliesPost(makeRequest(validBody), { params });
    expect(res.status).toBe(201);

    const [, , , calledActingAs] = vi.mocked(dbMod.addReply).mock.calls[0];
    expect(calledActingAs).toBe(actingAs);
  });

  it("returns 404 when addReply returns null (thread not found)", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity());
    vi.mocked(dbMod.addReply).mockResolvedValue(null);

    const res = await repliesPost(makeRequest(validBody), { params });
    expect(res.status).toBe(404);
  });

  it("backward compat: cookie session passes undefined actingAs", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity("bob"));
    vi.mocked(dbMod.addReply).mockResolvedValue({
      id: "t1", title: "T", author: "bob", category: "General",
      content: "c", upvotes: 1, createdAt: "2026-01-01", replies: [],
      isDanish: false, denmarkSpecific: false,
    });

    await repliesPost(makeRequest(validBody), { params });

    const [, , , calledActingAs] = vi.mocked(dbMod.addReply).mock.calls[0];
    expect(calledActingAs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/forum/[id]/upvote (upvoteThread)
// ---------------------------------------------------------------------------

describe("POST /api/forum/[id]/upvote — upvoteThread via bearer token", () => {
  const params = Promise.resolve({ id: "t1" });

  it("returns 401 when unauthenticated", async () => {
    const res = await threadUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("passes actingAs to upvoteThread when bearer token present", async () => {
    const { identity, actingAs } = makeBotIdentity("bot-upvote");
    resolveRequestIdentityMock.mockResolvedValue(identity);
    vi.mocked(dbMod.upvoteThread).mockResolvedValue(5);

    const res = await threadUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(200);

    const [, calledActingAs] = vi.mocked(dbMod.upvoteThread).mock.calls[0];
    expect(calledActingAs).toBe(actingAs);
  });

  it("returns 429 and skips upvoteThread once the write budget (identity or site-wide) is exhausted", async () => {
    const { identity } = makeBotIdentity("bot-upvote");
    resolveRequestIdentityMock.mockResolvedValue(identity);
    vi.mocked(checkAgentWriteAllowed).mockResolvedValueOnce(false);

    const res = await threadUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(429);
    expect(dbMod.upvoteThread).not.toHaveBeenCalled();
  });

  it("returns 503 (not an unhandled exception) when checkAgentWriteAllowed itself throws — this route has no top-level try/catch", async () => {
    const { identity } = makeBotIdentity("bot-upvote");
    resolveRequestIdentityMock.mockResolvedValue(identity);
    vi.mocked(checkAgentWriteAllowed).mockRejectedValueOnce(new Error("Rate limit RPC failed: connection refused"));

    const res = await threadUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(503);
    expect(dbMod.upvoteThread).not.toHaveBeenCalled();
  });

  it("returns 503 on rpc_error", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity());
    vi.mocked(dbMod.upvoteThread).mockResolvedValue("rpc_error");

    const res = await threadUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(503);
  });

  it("returns 404 when thread not found (upvoteThread returns null)", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity());
    vi.mocked(dbMod.upvoteThread).mockResolvedValue(null);

    const res = await threadUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/forum/[id]/replies/[replyId]/upvote (upvoteReply)
// ---------------------------------------------------------------------------

describe("POST /api/forum/[id]/replies/[replyId]/upvote — upvoteReply via bearer token", () => {
  const params = Promise.resolve({ id: "t1", replyId: "r1" });

  it("returns 401 when unauthenticated", async () => {
    const res = await replyUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(401);
  });

  it("passes actingAs to upvoteReply when bearer token present", async () => {
    const { identity, actingAs } = makeBotIdentity("bot-reply-upvote");
    resolveRequestIdentityMock.mockResolvedValue(identity);
    vi.mocked(dbMod.upvoteReply).mockResolvedValue(7);

    const res = await replyUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(200);

    const [, , calledActingAs] = vi.mocked(dbMod.upvoteReply).mock.calls[0];
    expect(calledActingAs).toBe(actingAs);
  });

  it("returns 503 on rpc_error", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity());
    vi.mocked(dbMod.upvoteReply).mockResolvedValue("rpc_error");

    const res = await replyUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(503);
  });

  it("returns 404 when reply not found (upvoteReply returns null)", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity());
    vi.mocked(dbMod.upvoteReply).mockResolvedValue(null);

    const res = await replyUpvotePost(makeRequest({}), { params });
    expect(res.status).toBe(404);
  });

  it("backward compat: cookie session passes undefined actingAs to upvoteReply", async () => {
    resolveRequestIdentityMock.mockResolvedValue(makeCookieIdentity("carol"));
    vi.mocked(dbMod.upvoteReply).mockResolvedValue(3);

    await replyUpvotePost(makeRequest({}), { params });

    const [, , calledActingAs] = vi.mocked(dbMod.upvoteReply).mock.calls[0];
    expect(calledActingAs).toBeUndefined();
  });
});
