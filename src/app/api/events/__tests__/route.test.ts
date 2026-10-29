import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc, getAuthUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRole: () => ({ rpc }),
  getAuthUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
  getClientIp: vi.fn((request: Request) => request.headers.get("x-real-ip") ?? "unknown"),
}));

import { POST } from "@/app/api/events/route";
import { checkRateLimit } from "@/lib/rate-limit";

function makeRequest(body: unknown, ip = "203.0.113.10") {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "x-real-ip": ip, "content-type": "text/plain;charset=UTF-8" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = {
  name: "copy_install",
  itemType: "skill",
  itemSlug: "jobnet-search",
  hostSlug: "universal",
  snippet: "install",
  path: "/skills/jobnet-search",
  sessionId: "abc-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue(true);
  rpc.mockResolvedValue({ data: null, error: null });
  getAuthUser.mockResolvedValue(null);
});

describe("POST /api/events", () => {
  it("records a valid event through the service-role RPC and returns 204", async () => {
    const response = await POST(makeRequest(VALID));

    expect(response.status).toBe(204);
    expect(checkRateLimit).toHaveBeenCalledWith("events:hashed:203.0.113.10", 120, 3600);
    expect(rpc).toHaveBeenCalledWith("record_analytics_event", {
      p_event_name: "copy_install",
      p_item_type: "skill",
      p_item_slug: "jobnet-search",
      p_host_slug: "universal",
      p_snippet: "install",
      p_path: "/skills/jobnet-search",
      p_session_id: "abc-123",
    });
  });

  it("attributes the event to the signed-in user from the session cookie", async () => {
    getAuthUser.mockResolvedValue({ id: "user-1", username: "u" });

    await POST(makeRequest({ name: "connect_view" }));

    expect(rpc).toHaveBeenCalledWith(
      "record_analytics_event",
      expect.objectContaining({ p_event_name: "connect_view", p_user_id: "user-1" }),
    );
  });

  it("ignores a client-supplied user id", async () => {
    await POST(makeRequest({ ...VALID, userId: "someone-else", p_user_id: "someone-else" }));

    const [, args] = rpc.mock.calls[0];
    expect(args).not.toHaveProperty("p_user_id");
  });

  it("rejects an event name outside the allowlist", async () => {
    const response = await POST(makeRequest({ ...VALID, name: "anything_else" }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects fields over the RPC's length caps", async () => {
    const response = await POST(makeRequest({ ...VALID, itemSlug: "x".repeat(201) }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(makeRequest("not json"));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 429 without recording when the IP is over its limit", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const response = await POST(makeRequest(VALID));

    expect(response.status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 204 when the rate-limit check itself fails, dropping the event", async () => {
    vi.mocked(checkRateLimit).mockRejectedValue(new Error("db down"));

    const response = await POST(makeRequest(VALID));

    expect(response.status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 204 when the RPC errors, so telemetry never surfaces a failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await POST(makeRequest(VALID));

    expect(response.status).toBe(204);
  });
});
