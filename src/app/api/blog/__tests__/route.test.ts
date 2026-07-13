import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mock the data layer and Supabase server client so importing the route is
// hermetic (no DB / env required during unit tests).
vi.mock("@/lib/db", () => ({
  getBlogPosts: vi.fn(),
  getBlogPostById: vi.fn(),
  createBlogPost: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({
  getAuthUser: vi.fn(),
  resolveBotRequestAuth: vi.fn(),
  resolveRequestIdentity: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceAgentWriteRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) }),
}));

import { blogPostSchema, POST } from "@/app/api/blog/route";
import { createBlogPost } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { enforceAgentWriteRateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BODY = {
  title: "How Agents Are Reshaping Nordic Software Teams",
  excerpt: "A concise summary of the article for the listing page.",
  content: "Full article body goes here. Long enough to be meaningful.",
  readTime: "4 min",
  publishedAt: "2026-07-09",
  imageUrl: "https://images.unsplash.com/photo-1234567890.jpg",
  category: "Agents" as const,
};

function makeRequest(body: unknown, authHeader?: string) {
  return new Request("http://localhost/api/blog", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

const MOCK_ACTING_AS = {
  user: { id: "user-abc-123", username: "agent_abc" },
  supabase: {} as never,
};

// ---------------------------------------------------------------------------
// blogPostSchema — required fields
// ---------------------------------------------------------------------------

describe("blogPostSchema — required fields", () => {
  it("accepts a complete valid submission", () => {
    expect(blogPostSchema.safeParse(VALID_BODY).success).toBe(true);
  });

  it("rejects a missing title", () => {
    const { title, ...noTitle } = VALID_BODY;
    void title;
    expect(blogPostSchema.safeParse(noTitle).success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(blogPostSchema.safeParse({ ...VALID_BODY, title: "" }).success).toBe(false);
  });

  it("rejects a title over 200 characters", () => {
    expect(blogPostSchema.safeParse({ ...VALID_BODY, title: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects a missing excerpt", () => {
    const { excerpt, ...noExcerpt } = VALID_BODY;
    void excerpt;
    expect(blogPostSchema.safeParse(noExcerpt).success).toBe(false);
  });

  it("rejects a missing content", () => {
    const { content, ...noContent } = VALID_BODY;
    void content;
    expect(blogPostSchema.safeParse(noContent).success).toBe(false);
  });

  it("rejects a non-URL imageUrl", () => {
    expect(blogPostSchema.safeParse({ ...VALID_BODY, imageUrl: "not-a-url" }).success).toBe(false);
  });

  it("rejects an imageUrl over 500 characters", () => {
    const longUrl = "https://images.unsplash.com/" + "x".repeat(480);
    expect(blogPostSchema.safeParse({ ...VALID_BODY, imageUrl: longUrl }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// blogPostSchema — category enum
// ---------------------------------------------------------------------------

describe("blogPostSchema — category enum", () => {
  it("accepts all three valid categories", () => {
    for (const category of ["Guides", "Agents", "Workflow"] as const) {
      expect(blogPostSchema.safeParse({ ...VALID_BODY, category }).success).toBe(true);
    }
  });

  it("rejects unknown categories", () => {
    for (const category of ["News", "Tutorial", "guides", "industry"]) {
      expect(blogPostSchema.safeParse({ ...VALID_BODY, category }).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/blog — auth scenarios
// ---------------------------------------------------------------------------

describe("POST /api/blog — auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header and no session cookie", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 201 when called with a valid bearer-resolved actingAs", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue({
      user: MOCK_ACTING_AS.user,
      botAuth: MOCK_ACTING_AS,
    });

    const createdPost = {
      id: "b_123456",
      title: VALID_BODY.title,
      excerpt: VALID_BODY.excerpt,
      content: VALID_BODY.content,
      author: MOCK_ACTING_AS.user.username,
      readTime: VALID_BODY.readTime,
      publishedAt: VALID_BODY.publishedAt,
      imageUrl: VALID_BODY.imageUrl,
      category: VALID_BODY.category,
    };
    vi.mocked(createBlogPost).mockResolvedValue(createdPost);

    const response = await POST(makeRequest(VALID_BODY, "Bearer token-xyz"));
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body).toMatchObject({ id: "b_123456", title: VALID_BODY.title });
  });

  it("returns 403 and skips the DB call when the honeypot field is filled", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue({
      user: MOCK_ACTING_AS.user,
      botAuth: MOCK_ACTING_AS,
    });

    const response = await POST(makeRequest({ ...VALID_BODY, website_url: "http://spam.example" }, "Bearer token-xyz"));
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body).toMatchObject({ error: "Access denied" });
    expect(createBlogPost).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/blog — validation
// ---------------------------------------------------------------------------

describe("POST /api/blog — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide a valid identity so validation, not auth, drives the failure.
    vi.mocked(resolveRequestIdentity).mockResolvedValue({
      user: MOCK_ACTING_AS.user,
      botAuth: MOCK_ACTING_AS,
    });
  });

  it("returns 400 with Zod error details when title is missing", async () => {
    const { title, ...noTitle } = VALID_BODY;
    void title;

    const response = await POST(makeRequest(noTitle));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body).toMatchObject({ error: "Invalid input" });
    // Zod issues array must be present and name the failing field.
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.some((d: { path: string[] }) => d.path.includes("title"))).toBe(true);
  });

  it("returns 400 when category is not one of the three allowed values", async () => {
    const response = await POST(makeRequest({ ...VALID_BODY, category: "News" }));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body).toMatchObject({ error: "Invalid input" });
    expect(Array.isArray(body.details)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/blog — cache invalidation
// ---------------------------------------------------------------------------

describe("POST /api/blog — cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls createBlogPost with actingAs matching the resolved bearer identity", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue({
      user: MOCK_ACTING_AS.user,
      botAuth: MOCK_ACTING_AS,
    });

    const createdPost = {
      id: "b_999",
      title: VALID_BODY.title,
      excerpt: VALID_BODY.excerpt,
      content: VALID_BODY.content,
      author: MOCK_ACTING_AS.user.username,
      readTime: VALID_BODY.readTime,
      publishedAt: VALID_BODY.publishedAt,
      imageUrl: VALID_BODY.imageUrl,
      category: VALID_BODY.category,
    };
    vi.mocked(createBlogPost).mockResolvedValue(createdPost);

    await POST(makeRequest(VALID_BODY, "Bearer token-xyz"));

    // Verify createBlogPost was called with the bearer-resolved actingAs so
    // the DB write carries the correct user_id and RLS sees the right identity.
    expect(vi.mocked(createBlogPost)).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(createBlogPost).mock.calls[0];
    // Last positional arg is actingAs
    expect(callArgs[callArgs.length - 1]).toBe(MOCK_ACTING_AS);
  });

  it("rejects a bearer-authenticated write with 429 once the write budget (identity or site-wide) is exhausted, without touching createBlogPost", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue({
      user: MOCK_ACTING_AS.user,
      botAuth: MOCK_ACTING_AS,
    });
    vi.mocked(enforceAgentWriteRateLimit).mockResolvedValueOnce(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const response = await POST(makeRequest(VALID_BODY, "Bearer token-xyz"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBeDefined();
    expect(vi.mocked(createBlogPost)).not.toHaveBeenCalled();
  });

  it("returns 503 (not 400) when the rate-limit check itself throws, e.g. a rate-limiter RPC outage", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue({
      user: MOCK_ACTING_AS.user,
      botAuth: MOCK_ACTING_AS,
    });
    vi.mocked(enforceAgentWriteRateLimit).mockResolvedValueOnce(
      NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    );

    const response = await POST(makeRequest(VALID_BODY, "Bearer token-xyz"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBeDefined();
    expect(vi.mocked(createBlogPost)).not.toHaveBeenCalled();
  });

  it("does not rate-limit cookie-authenticated (non-bot) writes", async () => {
    vi.mocked(resolveRequestIdentity).mockResolvedValue({
      user: MOCK_ACTING_AS.user,
      // no botAuth — a real human session
    });
    vi.mocked(createBlogPost).mockResolvedValue({
      id: "b_998",
      ...VALID_BODY,
      author: MOCK_ACTING_AS.user.username,
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(vi.mocked(enforceAgentWriteRateLimit)).not.toHaveBeenCalled();
  });
});
