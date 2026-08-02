import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db file before importing the route handler
const getFeedItemsMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getFeedItems: (...args: unknown[]) => getFeedItemsMock(...args),
}));

import { GET } from "../route";

describe("GET /api/feed API Route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFeedItemsMock.mockResolvedValue([
      { id: "s_1", type: "skill", title: "Test Skill", summary: "Desc", url: "url", tags: [], publishedAt: "2026-07-09T00:00:00Z" }
    ]);
  });

  it("returns 200 and feed items with default parameters", async () => {
    const req = new Request("https://vibetrends.dk/api/feed");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.items).toBeDefined();

    // Verify default options passed to getFeedItems
    expect(getFeedItemsMock).toHaveBeenCalledWith({
      since: undefined,
      types: undefined,
      lang: "da",
      limit: undefined, // should fallback to undefined so db defaults to 50
    });
  });

  it("rejects over-long query parameters with 400 Bad Request", async () => {
    // since > 100 characters
    const longSince = "2".repeat(101);
    const req1 = new Request(`https://vibetrends.dk/api/feed?since=${longSince}`);
    const res1 = await GET(req1);
    expect(res1.status).toBe(400);
    expect(await res1.json()).toEqual({ error: "Query parameter exceeds maximum length limit" });

    // type > 100 characters
    const longType = "a".repeat(101);
    const req2 = new Request(`https://vibetrends.dk/api/feed?type=${longType}`);
    const res2 = await GET(req2);
    expect(res2.status).toBe(400);

    // lang > 10 characters
    const longLang = "da-DK-test-extra";
    const req3 = new Request(`https://vibetrends.dk/api/feed?lang=${longLang}`);
    const res3 = await GET(req3);
    expect(res3.status).toBe(400);

    // limit > 10 characters
    const longLimit = "1".repeat(11);
    const req4 = new Request(`https://vibetrends.dk/api/feed?limit=${longLimit}`);
    const res4 = await GET(req4);
    expect(res4.status).toBe(400);
  });

  it("validates 'since' parameter and rejects malformed ISO timestamp with 400", async () => {
    const req = new Request("https://vibetrends.dk/api/feed?since=invalid-date");
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid 'since' — expected an ISO 8601 timestamp, e.g. 2026-07-09T00:00:00Z"
    });
  });

  it("validates types parameter and rejects invalid types with 400", async () => {
    const req = new Request("https://vibetrends.dk/api/feed?type=invalid,skill");
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid type(s): invalid. Valid: skill, mcp, cli, vibe"
    });
  });

  it("correctly parses valid parameters and forwards them to getFeedItems", async () => {
    const req = new Request("https://vibetrends.dk/api/feed?since=2026-07-09T00:00:00Z&type=skill,vibe&lang=en&limit=25");
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(getFeedItemsMock).toHaveBeenCalledWith({
      since: "2026-07-09T00:00:00Z",
      types: ["skill", "vibe"],
      lang: "en",
      limit: 25,
    });
  });

  it("correctly handles empty or invalid limit strings by passing undefined", async () => {
    const req = new Request("https://vibetrends.dk/api/feed?limit=abc");
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(getFeedItemsMock).toHaveBeenCalledWith({
      since: undefined,
      types: undefined,
      lang: "da",
      limit: undefined,
    });
  });
});
