import { describe, it, expect, vi, beforeEach } from "vitest";

const { signInAnonymously } = vi.hoisted(() => ({
  signInAnonymously: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { signInAnonymously },
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
  getClientIp: vi.fn((request: Request) => {
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();

    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const hops = forwardedFor.split(",").map((h) => h.trim()).filter(Boolean);
      if (hops.length > 0) return hops[hops.length - 1];
    }

    return "unknown";
  }),
}));

import { POST } from "@/app/api/agentauth/route";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";

function makeRequest(forwardedFor?: string, realIp?: string) {
  const headers: Record<string, string> = {};
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  if (realIp) headers["x-real-ip"] = realIp;
  return new Request("http://localhost/api/agentauth", { method: "POST", headers });
}

const VALID_SESSION = {
  access_token: "access-token-abc",
  refresh_token: "refresh-token-abc",
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

  it("returns the refresh token so an agent can renew this identity without re-provisioning", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    const response = await POST(makeRequest("203.0.113.10"));
    const body = await response.json();

    expect(body.refresh_token).toBe(VALID_SESSION.refresh_token);
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

  it("trusts the LAST entry of a multi-hop x-forwarded-for header, not the first (the first is client-controlled)", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    await POST(makeRequest("203.0.113.10, 70.41.3.18, 150.172.238.178"));

    expect(hashIp).toHaveBeenCalledWith("150.172.238.178");
  });

  it("cannot be rate-limit-bypassed by a spoofed leading x-forwarded-for entry — same real (last-hop) IP always hashes to the same key", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    await POST(makeRequest("1.2.3.4, 150.172.238.178"));
    await POST(makeRequest("9.9.9.9, 150.172.238.178"));

    expect(hashIp).toHaveBeenNthCalledWith(1, "150.172.238.178");
    expect(hashIp).toHaveBeenNthCalledWith(2, "150.172.238.178");
  });

  it("prefers x-real-ip over x-forwarded-for when both are present", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    signInAnonymously.mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: "anon-user-1" } },
      error: null,
    });

    await POST(makeRequest("1.2.3.4, 5.6.7.8", "203.0.113.99"));

    expect(hashIp).toHaveBeenCalledWith("203.0.113.99");
  });
});
