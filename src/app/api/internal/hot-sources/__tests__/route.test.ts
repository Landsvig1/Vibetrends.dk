import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetToken = vi.fn();
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: () => mockGetToken(),
}));

import { GET } from "../route";

/**
 * This route is the only place the scan touches someone else's authenticated
 * API, so the tests that matter are the ones about failing safely: refusing
 * unauthenticated callers, refusing when no secret is configured at all, and
 * reporting upstream trouble as an error the Action can act on rather than as
 * an empty-but-successful ranking.
 */

const SECRET = "test-secret-value";

const request = (auth?: string) =>
  new Request("https://vibetrends.dk/api/internal/hot-sources", {
    headers: auth ? { authorization: auth } : {},
  });

const item = (over: Record<string, unknown> = {}) => ({
  slug: "find-skills",
  name: "find-skills",
  source: "vercel-labs/skills",
  installs: 24531,
  sourceType: "github",
  installUrl: "https://github.com/vercel-labs/skills",
  url: "https://skills.sh/vercel-labs/skills/find-skills",
  ...over,
});

type Spec = { status?: number; body?: unknown; headers?: Record<string, string> };

/**
 * Respond per view, so the two upstream calls can differ or fail apart.
 *
 * A view may be given an array of specs, one per page, to exercise pagination.
 * A single spec answers page 0 and reports no further pages.
 */
function mockUpstream(byView: Record<string, Spec | Spec[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const view = params.get("view") ?? "";
      const page = Number(params.get("page") ?? 0);
      const entry = byView[view];
      const spec = (Array.isArray(entry) ? entry[page] : page === 0 ? entry : undefined) ?? {
        status: 404,
        body: {},
      };
      return {
        ok: (spec.status ?? 200) < 400,
        status: spec.status ?? 200,
        headers: { get: (h: string) => spec.headers?.[h.toLowerCase()] ?? null },
        json: async () => spec.body ?? {},
      };
    })
  );
}

/** A full page of distinct items, so `hasMore` is what decides continuation. */
const fullPage = (prefix: string) =>
  Array.from({ length: 500 }, (_, i) =>
    item({ slug: `${prefix}-${i}`, name: `${prefix}-${i}` })
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HOT_SCAN_SECRET = SECRET;
  mockGetToken.mockResolvedValue("oidc-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HOT_SCAN_SECRET;
});

describe("authorization", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    const res = await GET(request("Bearer wrong-secret-value"));
    expect(res.status).toBe(401);
  });

  it("rejects a secret of a different length without throwing", async () => {
    // timingSafeEqual throws on length mismatch; the guard must catch it first.
    const res = await GET(request("Bearer short"));
    expect(res.status).toBe(401);
  });

  it("fails closed when no secret is configured", async () => {
    delete process.env.HOT_SCAN_SECRET;
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(401);
  });

  it("never mints an OIDC token for an unauthorized caller", async () => {
    await GET(request("Bearer nope"));
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});

describe("fetching and normalizing", () => {
  it("returns normalized entries with repo, installs and change", async () => {
    mockUpstream({
      "all-time": { body: { data: [item()] } },
      hot: { body: { data: [item({ change: 412 })] } },
    });

    const res = await GET(request(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("skills.sh");
    expect(body.entries).toEqual([
      {
        slug: "find-skills",
        repo: "vercel-labs/skills",
        installs: 24531,
        change: 412,
        url: "https://skills.sh/vercel-labs/skills/find-skills",
      },
    ]);
  });

  it("sends the OIDC token as a bearer to skills.sh", async () => {
    mockUpstream({ "all-time": { body: { data: [] } }, hot: { body: { data: [] } } });
    await GET(request(`Bearer ${SECRET}`));
    const call = vi.mocked(fetch).mock.calls[0];
    expect((call[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer oidc-token",
    });
  });

  it("falls back to the source field when installUrl is not a GitHub URL", async () => {
    mockUpstream({
      "all-time": { body: { data: [item({ installUrl: "https://example.com/x" })] } },
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries[0].repo).toBe("vercel-labs/skills");
  });

  it("carries a null repo rather than guessing when the source is not GitHub", async () => {
    mockUpstream({
      "all-time": {
        body: { data: [item({ installUrl: undefined, source: "somewhere", sourceType: "other" })] },
      },
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries[0].repo).toBeNull();
  });

  it("keeps two skills from the same repo apart", async () => {
    mockUpstream({
      "all-time": {
        body: {
          data: [
            item({ slug: "ce-plan", name: "ce-plan", installUrl: "https://github.com/anthropics/skills" }),
            item({ slug: "ce-work", name: "ce-work", installUrl: "https://github.com/anthropics/skills" }),
          ],
        },
      },
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries.map((e: { slug: string }) => e.slug)).toEqual(["ce-plan", "ce-work"]);
  });

  it("includes an entry that only the hot view knows about", async () => {
    mockUpstream({
      "all-time": { body: { data: [] } },
      hot: { body: { data: [item({ slug: "brand-new", name: "brand-new", change: 99 })] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].change).toBe(99);
  });

  it("skips items with no usable name", async () => {
    mockUpstream({
      "all-time": { body: { data: [item({ slug: "", name: "" }), item()] } },
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries).toHaveLength(1);
  });

  it("defaults a missing install count to 0 rather than emitting NaN", async () => {
    mockUpstream({
      "all-time": { body: { data: [item({ installs: undefined })] } },
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries[0].installs).toBe(0);
  });
});

describe("pagination", () => {
  const pageSpec = (prefix: string, hasMore: boolean) => ({
    body: { data: fullPage(prefix), pagination: { hasMore } },
  });

  it("reads past the first page when the API says there is more", async () => {
    mockUpstream({
      "all-time": [pageSpec("a", true), pageSpec("b", false)],
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries).toHaveLength(1000);
  });

  it("stops as soon as hasMore is false", async () => {
    mockUpstream({
      "all-time": [pageSpec("a", false), pageSpec("b", true)],
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries).toHaveLength(500);
  });

  it("stops on a short page even when hasMore claims otherwise", async () => {
    // Trusting a lying hasMore would loop to the page cap fetching nothing.
    mockUpstream({
      "all-time": [
        { body: { data: [item()], pagination: { hasMore: true } } },
        pageSpec("b", true),
      ],
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.entries).toHaveLength(1);
  });

  it("never reads more than the page cap, however much the API offers", async () => {
    mockUpstream({
      "all-time": Array.from({ length: 20 }, (_, i) => pageSpec(`p${i}`, true)),
      hot: { body: { data: [] } },
    });
    await GET(request(`Bearer ${SECRET}`));
    const allTimeCalls = vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]).includes("view=all-time"));
    expect(allTimeCalls).toHaveLength(4);
  });

  it("requests pages in order starting at 0", async () => {
    mockUpstream({
      "all-time": [pageSpec("a", true), pageSpec("b", false)],
      hot: { body: { data: [] } },
    });
    await GET(request(`Bearer ${SECRET}`));
    const pages = vi
      .mocked(fetch)
      .mock.calls.map((c) => String(c[0]))
      .filter((u) => u.includes("view=all-time"))
      .map((u) => new URL(u).searchParams.get("page"));
    expect(pages).toEqual(["0", "1"]);
  });

  it("names the failing page in the error", async () => {
    mockUpstream({
      "all-time": [pageSpec("a", true), { status: 500 }],
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.message).toContain("page 1");
  });
});

describe("upstream failure", () => {
  it("reports 502 when skills.sh returns an error status", async () => {
    mockUpstream({ "all-time": { status: 503 }, hot: { body: { data: [] } } });
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain("503");
  });

  it("surfaces retry-after on a 429 so the log says something actionable", async () => {
    mockUpstream({
      "all-time": { status: 429, headers: { "retry-after": "30" } },
      hot: { body: { data: [] } },
    });
    const body = await (await GET(request(`Bearer ${SECRET}`))).json();
    expect(body.message).toContain("retry-after 30");
  });

  it("reports 502 when the response has no data array (shape drift)", async () => {
    mockUpstream({
      "all-time": { body: { results: [] } },
      hot: { body: { data: [] } },
    });
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(502);
  });

  it("reports 503 when no OIDC token can be minted", async () => {
    mockGetToken.mockRejectedValue(new Error("OIDC not enabled"));
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("oidc_unavailable");
  });

  it("never returns an empty-but-successful ranking when a view failed", async () => {
    // The dangerous shape: 200 with entries: []. The scan would read that as
    // "skills.sh had nothing hot this week" and merge without its best source.
    mockUpstream({ "all-time": { status: 500 }, hot: { body: { data: [item()] } } });
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).not.toBe(200);
  });
});
