import { describe, it, expect, vi, beforeEach } from "vitest";

// Every REST route that publishes a row under the caller's username:
// a reserved author is refused with 400 before db.ts is called, and the DB
// trigger refusals (reserved_author, rate_limited) map to 400 and 429.

vi.mock("@/lib/db", () => ({
  createThread: vi.fn(),
  addReply: vi.fn(),
  createSkill: vi.fn(),
  createProject: vi.fn(),
  createAgent: vi.fn(),
  createBlogPost: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  resolveRequestIdentity: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

vi.mock("@/lib/honeypot", () => ({
  validateHoneypot: () => true,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceAgentWriteRateLimit: vi.fn().mockResolvedValue(null),
}));

import * as dbMod from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { ContentWriteError } from "@/lib/contentWriteErrors";
import { ADMIN_USER_IDS, CURATOR_BOT_USER_ID } from "@/lib/permissions";
import { POST as forumPost } from "@/app/api/forum/route";
import { POST as repliesPost } from "@/app/api/forum/[id]/replies/route";
import { POST as skillsPost } from "@/app/api/skills/route";
import { POST as vibesPost } from "@/app/api/vibes/route";
import { POST as agentsPost } from "@/app/api/agents/route";
import { POST as blogPost } from "@/app/api/blog/route";

type Handler = (req: Request) => Promise<Response>;

const routes: { name: string; post: Handler; dbFn: keyof typeof dbMod; body: Record<string, unknown> }[] = [
  {
    name: "POST /api/forum",
    post: forumPost,
    dbFn: "createThread",
    body: { title: "My Thread", category: "General", content: "Content of the thread here." },
  },
  {
    name: "POST /api/forum/[id]/replies",
    post: (req) => repliesPost(req, { params: Promise.resolve({ id: "t1" }) }),
    dbFn: "addReply",
    body: { content: "A reply with enough content." },
  },
  {
    name: "POST /api/skills",
    post: skillsPost,
    dbFn: "createSkill",
    body: { title: "My Skill", category: "fullstack-devops", githubUrl: "https://github.com/foo/bar" },
  },
  {
    name: "POST /api/vibes",
    post: vibesPost,
    dbFn: "createProject",
    body: { title: "My Project", description: "A project description long enough to pass validation." },
  },
  {
    name: "POST /api/agents",
    post: agentsPost,
    dbFn: "createAgent",
    body: { name: "Scrapey", category: "CLI", description: "A handy scraper CLI an agent can invoke." },
  },
  {
    name: "POST /api/blog",
    post: blogPost,
    dbFn: "createBlogPost",
    body: {
      title: "How Agents Are Reshaping Nordic Software Teams",
      excerpt: "A concise summary of the article for the listing page.",
      content: "Full article body goes here. Long enough to be meaningful.",
      readTime: "4 min",
      publishedAt: "2026-07-09",
      imageUrl: "https://images.unsplash.com/photo-1234567890.jpg",
      category: "Agents",
    },
  },
];

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function asUser(user: { id: string; username: string; email?: string }) {
  vi.mocked(resolveRequestIdentity).mockResolvedValue({ user });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(routes)("$name", ({ post, dbFn, body }) => {
  const dbMock = () => vi.mocked(dbMod[dbFn] as (...args: unknown[]) => Promise<unknown>);

  it("refuses a reserved author with 400 before calling the DB", async () => {
    asUser({ id: "u1", username: " Kasper ", email: "someone@example.com" });
    const res = await post(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This author name is reserved");
    expect(dbMock()).not.toHaveBeenCalled();
  });

  it("lets the admin publish under a reserved name", async () => {
    asUser({ id: ADMIN_USER_IDS[0], username: "kasper" });
    dbMock().mockResolvedValue({ id: "x1", thread: { id: "t1" }, replyId: "r1" });
    const res = await post(makeRequest(body));
    expect(res.status).toBe(201);
    expect(dbMock()).toHaveBeenCalled();
  });

  it("lets the curator bot publish under its own name", async () => {
    asUser({ id: CURATOR_BOT_USER_ID, username: "Vibetrends Bot" });
    dbMock().mockResolvedValue({ id: "x1", thread: { id: "t1" }, replyId: "r1" });
    const res = await post(makeRequest(body));
    expect(res.status).toBe(201);
  });

  it("maps a DB reserved_author refusal to 400", async () => {
    asUser({ id: "u1", username: "alice" });
    dbMock().mockRejectedValue(new ContentWriteError("reserved_author"));
    const res = await post(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This author name is reserved");
  });

  it("maps a DB rate_limited refusal to 429", async () => {
    asUser({ id: "u1", username: "alice" });
    dbMock().mockRejectedValue(new ContentWriteError("rate_limited"));
    const res = await post(makeRequest(body));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Too many requests");
  });
});
