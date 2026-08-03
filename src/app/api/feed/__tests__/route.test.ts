import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getFeedItems: vi.fn(),
}));

import { GET } from "../route";
import { getFeedItems, type FeedItem } from "@/lib/db";

function makeRequest(queryParams: Record<string, string>) {
  const url = new URL("http://localhost/api/feed");
  for (const [key, val] of Object.entries(queryParams)) {
    url.searchParams.set(key, val);
  }
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/feed", () => {
  it("happy path: returns items when called with no query parameters", async () => {
    const mockItems: FeedItem[] = [
      { id: "s_12345", type: "skill" as const, title: "Test Skill", summary: "Test Summary", url: "https://example.com", tags: [], publishedAt: "2026-07-09T00:00:00.000Z" }
    ];
    vi.mocked(getFeedItems).mockResolvedValue(mockItems);

    const response = await GET(makeRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.items).toEqual(mockItems);
    expect(getFeedItems).toHaveBeenCalledWith({
      since: undefined,
      types: undefined,
      lang: "da",
      limit: undefined,
    });
  });

  it("happy path: accepts valid query parameters", async () => {
    vi.mocked(getFeedItems).mockResolvedValue([]);

    const response = await GET(makeRequest({
      since: "2026-07-09T00:00:00Z",
      type: "skill,mcp",
      lang: "en",
      limit: "15",
    }));

    expect(response.status).toBe(200);
    expect(getFeedItems).toHaveBeenCalledWith({
      since: "2026-07-09T00:00:00Z",
      types: ["skill", "mcp"],
      lang: "en",
      limit: 15,
    });
  });

  it("limits: falls back to undefined for limit when it is absent or empty", async () => {
    vi.mocked(getFeedItems).mockResolvedValue([]);

    const response = await GET(makeRequest({ limit: "" }));
    expect(response.status).toBe(200);
    expect(getFeedItems).toHaveBeenCalledWith({
      since: undefined,
      types: undefined,
      lang: "da",
      limit: undefined,
    });
  });

  it("limits: rejects non-finite limit parameter", async () => {
    const response = await GET(makeRequest({ limit: "abc" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid 'limit' parameter");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("since: rejects invalid ISO-8601 date format", async () => {
    const response = await GET(makeRequest({ since: "not-a-date" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid 'since'");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("type: rejects invalid type values", async () => {
    const response = await GET(makeRequest({ type: "skill,invalid" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid type(s)");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("security: enforces max length limit on 'since' parameter", async () => {
    const longSince = "2026-07-09T00:00:00Z" + "a".repeat(100);
    const response = await GET(makeRequest({ since: longSince }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Parameter 'since' exceeds length limit");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("security: enforces max length limit on 'type' parameter", async () => {
    const longType = "skill,mcp,cli,vibe," + "a".repeat(100);
    const response = await GET(makeRequest({ type: longType }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Parameter 'type' exceeds length limit");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("security: enforces max length limit on 'lang' parameter", async () => {
    const longLang = "da-DK-custom";
    const response = await GET(makeRequest({ lang: longLang }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Parameter 'lang' exceeds length limit");
    expect(getFeedItems).not.toHaveBeenCalled();
  });

  it("security: enforces max length limit on 'limit' parameter", async () => {
    const longLimit = "1234567891011";
    const response = await GET(makeRequest({ limit: longLimit }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Parameter 'limit' exceeds length limit");
    expect(getFeedItems).not.toHaveBeenCalled();
  });
});
