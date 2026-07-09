import { describe, it, expect, vi, beforeEach } from "vitest";

const signInAnonymously = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { signInAnonymously },
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
}));

import { POST } from "@/app/api/agentauth/route";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";

function makeRequest(ip?: string) {
  return new Request("http://localhost/api/agentauth", {
    method: "POST",
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

const VALID_SESSION = {
  access_token: "access-token-abc",
  refresh_token: "refresh-token-should-never-be-returned",
  expires_in: 3600,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/agentauth", () => {
  it("issues a bearer token on the happy path", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    const response = await POST(makeRequest("203.0.113.10"));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.access_token).toBe(VALID_SESSION.access_token);
    expect(body.token_type).toBe("bearer");
    expect(body.expires_in).toBe(3600);
  });

  it("never returns the refresh token", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    const response = await POST(makeRequest("203.0.113.10"));
    const body = await response.json();

    expect(body.refresh_token).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("refresh-token-should-never-be-returned");
  });

  it("sets a non-degenerate full_name in user_metadata (KTD3)", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    await POST(makeRequest("203.0.113.10"));

    expect(signInAnonymously).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({
            full_name: expect.stringMatching(/^agent_/),
          }),
        }),
      })
    );
  });

  it("rejects with 429 when the IP is over the rate limit", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const response = await POST(makeRequest("203.0.113.10"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBeDefined();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("hashes the IP via hashIp() before using it as a rate-limit key, rather than passing the raw IP directly", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    await POST(makeRequest("203.0.113.10"));

    expect(hashIp).toHaveBeenCalledWith("203.0.113.10");
    const [key] = vi.mocked(checkRateLimit).mock.calls[0];
    expect(key).toContain(vi.mocked(hashIp).mock.results[0].value);
    expect(key).not.toBe("203.0.113.10");
  });

  it("falls back to a stable key when no x-forwarded-for header is present", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(201);
    expect(hashIp).toHaveBeenCalledWith("unknown");
  });

  it("returns 503 with a diagnosable message when anonymous sign-in fails (e.g. disabled on the Supabase project)", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Anonymous sign-ins are disabled" },
    });

    const response = await POST(makeRequest("203.0.113.10"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/anonymous/i);
  });

  it("takes only the first entry of a multi-hop x-forwarded-for header", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    await POST(makeRequest("203.0.113.10, 70.41.3.18, 150.172.238.178"));

    expect(hashIp).toHaveBeenCalledWith("203.0.113.10");
  });
});
