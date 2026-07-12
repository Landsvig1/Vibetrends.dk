import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
  getClientIp: vi.fn(() => "203.0.113.10"),
}));

import { GET } from "../route";
import { checkRateLimit } from "@/lib/rate-limit";

function makeRequest(urlParam?: string) {
  const url = urlParam
    ? `http://localhost/api/github-meta?url=${encodeURIComponent(urlParam)}`
    : `http://localhost/api/github-meta`;
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /api/github-meta", () => {
  it("returns repo details on the happy path", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ name: "test-repo", description: "This is a test repo" }),
    } as Response);

    const response = await GET(makeRequest("https://github.com/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.name).toBe("test-repo");
    expect(body.description).toBe("This is a test repo");
    expect(checkRateLimit).toHaveBeenCalledWith("githubmeta:hashed:203.0.113.10", 30, 60);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const response = await GET(makeRequest("https://github.com/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("Too many requests");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid GitHub URLs", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const response = await GET(makeRequest("https://invalid-url.com"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid GitHub URL");
  });

  it("returns 503 when GitHub rate limit is hit", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    vi.mocked(fetch).mockResolvedValue({
      status: 403,
      ok: false,
    } as Response);

    const response = await GET(makeRequest("https://github.com/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("Rate limited");
  });

  it("returns 404 when the repository is not found", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    vi.mocked(fetch).mockResolvedValue({
      status: 404,
      ok: false,
    } as Response);

    const response = await GET(makeRequest("https://github.com/owner/nonexistent"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Repo not found");
  });
});
