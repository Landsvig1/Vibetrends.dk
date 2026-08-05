import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db file so we do not attempt actual database connections
vi.mock("@/lib/db", () => ({
  getFeedItems: vi.fn(),
}));

import { GET } from "../route";
import { getFeedItems } from "@/lib/db";

function makeRequest(queryParams: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/feed");
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new Request(url.toString());
}

describe("GET /api/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 on happy path with default parameters", async () => {
    vi.mocked(getFeedItems).mockResolvedValue([
      {
        id: "s_123456789",
        type: "skill",
        title: "Test Skill",
        summary: "A nice skill",
        url: "https://vibetrends.dk/skills/example-skill",
        tags: ["test"],
        publishedAt: "2026-07-09T00:00:00Z",
      },
    ]);

    const response = await GET(makeRequest());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.count).toBe(1);
    expect(body.items[0].title).toBe("Test Skill");

    // Ensure we passed undefined for limit and since when omitted
    expect(getFeedItems).toHaveBeenCalledWith({
      since: undefined,
      types: undefined,
      lang: "da",
      limit: undefined,
    });
  });

  it("handles valid parameters correctly", async () => {
    vi.mocked(getFeedItems).mockResolvedValue([]);

    const response = await GET(
      makeRequest({
        since: "2026-07-09T00:00:00Z",
        type: "skill,mcp",
        lang: "en",
        limit: "10",
      })
    );
    expect(response.status).toBe(200);

    expect(getFeedItems).toHaveBeenCalledWith({
      since: "2026-07-09T00:00:00Z",
      types: ["skill", "mcp"],
      lang: "en",
      limit: 10,
    });
  });

  it("treats empty since, type, and lang query parameters as absent", async () => {
    vi.mocked(getFeedItems).mockResolvedValue([]);

    const response = await GET(
      makeRequest({
        since: "",
        type: "",
        lang: "",
      })
    );
    expect(response.status).toBe(200);

    // Empties must fallback to undefined (or default 'da' for lang), preserving main behavior
    expect(getFeedItems).toHaveBeenCalledWith({
      since: undefined,
      types: undefined,
      lang: "da",
      limit: undefined,
    });
  });

  it("rejects since parameter over 100 characters", async () => {
    const response = await GET(
      makeRequest({
        since: "x".repeat(101),
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Invalid 'since' parameter length");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("rejects invalid format for since parameter", async () => {
    const response = await GET(
      makeRequest({
        since: "not-a-date",
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Invalid 'since'");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("rejects type parameter over 100 characters", async () => {
    const response = await GET(
      makeRequest({
        type: "x".repeat(101),
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Invalid 'type' parameter length");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("rejects invalid values inside type parameter", async () => {
    const response = await GET(
      makeRequest({
        type: "skill,invalid_type",
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Invalid type(s)");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("rejects lang parameter over 10 characters", async () => {
    const response = await GET(
      makeRequest({
        lang: "x".repeat(11),
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Invalid 'lang' parameter length");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("rejects limit parameter over 10 characters", async () => {
    const response = await GET(
      makeRequest({
        limit: "x".repeat(11),
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Invalid 'limit' parameter length");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("rejects non-numeric limit parameter", async () => {
    const response = await GET(
      makeRequest({
        limit: "abc",
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Invalid 'limit' format");
    expect(getFeedItems).not.toHaveBeenCalled();
  });
});
