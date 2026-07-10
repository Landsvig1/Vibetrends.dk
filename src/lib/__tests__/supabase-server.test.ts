import { describe, it, expect, vi, beforeEach } from "vitest";

// resolveBotRequestAuth builds its own Supabase client (not the cookie-based
// createSupabaseServerClient), so we mock @supabase/supabase-js's createClient
// to control auth.getUser() and to inspect what config it was built with —
// specifically, that the bearer token is forwarded as a global header so the
// *same* client can later perform RLS-authenticated writes.
const state = vi.hoisted(() => ({
  lastConfig: null as unknown,
  userResponse: { data: { user: null as Record<string, unknown> | null }, error: null as unknown },
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: vi.fn((_url: string, _key: string, config?: unknown) => {
      state.lastConfig = config;
      return {
        auth: {
          getUser: vi.fn(async () => state.userResponse),
        },
      };
    }),
  };
});

// getAuthUser() goes through createSupabaseServerClient() (@supabase/ssr's
// createServerClient + next/headers cookies), a separate client-construction
// path from resolveBotRequestAuth's plain createClient above — mock both so
// getAuthUser tests don't touch a real cookie jar or network.
const cookieState = vi.hoisted(() => ({
  authUserResponse: { data: { user: null as Record<string, unknown> | null } },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => cookieState.authUserResponse),
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => {},
  })),
}));

import { resolveBotRequestAuth, getAuthUser, resolveRequestIdentity } from "@/lib/supabase-server";

function makeRequest(headers: Record<string, string>) {
  return new Request("https://vibetrends.dk/api/vibes", { headers });
}

beforeEach(() => {
  state.lastConfig = null;
  state.userResponse = { data: { user: null }, error: null };
  cookieState.authUserResponse = { data: { user: null } };
});

describe("getAuthUser", () => {
  it("resolves a real (non-anonymous) cookie session", async () => {
    cookieState.authUserResponse = {
      data: { user: { id: "human-1", email: "person@example.com", user_metadata: {}, is_anonymous: false } },
    };

    const result = await getAuthUser();

    expect(result).toEqual({ id: "human-1", username: "person_vibe" });
  });

  it("rejects an anonymous session presented via cookie, even though the cookie itself is valid", async () => {
    // Same shape /api/agentauth's signInAnonymously() produces: a real,
    // validly-signed session, just with is_anonymous: true. An agent could
    // repackage its own access/refresh tokens as this cookie shape instead
    // of a Bearer header specifically to dodge checkAgentWriteAllowed.
    cookieState.authUserResponse = {
      data: { user: { id: "anon-1", email: "", user_metadata: { full_name: "agent_abc123" }, is_anonymous: true } },
    };

    const result = await getAuthUser();

    expect(result).toBeNull();
  });

  it("returns null when there is no session", async () => {
    cookieState.authUserResponse = { data: { user: null } };
    const result = await getAuthUser();
    expect(result).toBeNull();
  });
});

describe("resolveBotRequestAuth", () => {
  it("resolves user + an authenticated client from a valid Bearer token", async () => {
    state.userResponse = { data: { user: { id: "user-1", email: "vibes-bot@vibetrends.dk", user_metadata: {} } }, error: null };

    const result = await resolveBotRequestAuth(makeRequest({ authorization: "Bearer good-token" }));

    expect(result).not.toBeNull();
    expect(result?.user.id).toBe("user-1");
    expect(result?.supabase).toBeDefined();
    // The token must be forwarded as a global header so subsequent table
    // writes on this same client carry it too (this is what makes RLS see
    // `authenticated` instead of `anon` for the insert that follows).
    expect(state.lastConfig).toMatchObject({
      global: { headers: { Authorization: "Bearer good-token" } },
    });
  });

  it("derives username from the email local-part when no full_name metadata is set", async () => {
    state.userResponse = { data: { user: { id: "user-2", email: "vibes-bot@vibetrends.dk", user_metadata: {} } }, error: null };

    const result = await resolveBotRequestAuth(makeRequest({ authorization: "Bearer tok" }));

    expect(result?.user.username).toBe("vibes_bot_vibe");
  });

  it("returns null when no Authorization header is present", async () => {
    const result = await resolveBotRequestAuth(makeRequest({}));
    expect(result).toBeNull();
  });

  it("returns null for a malformed Authorization header (missing Bearer prefix)", async () => {
    const result = await resolveBotRequestAuth(makeRequest({ authorization: "Token abc" }));
    expect(result).toBeNull();
  });

  it("returns null for an empty bearer token", async () => {
    const result = await resolveBotRequestAuth(makeRequest({ authorization: "Bearer " }));
    expect(result).toBeNull();
  });

  it("returns null for an expired or revoked token", async () => {
    state.userResponse = { data: { user: null }, error: { message: "invalid JWT" } };
    const result = await resolveBotRequestAuth(makeRequest({ authorization: "Bearer expired" }));
    expect(result).toBeNull();
  });
});

describe("resolveRequestIdentity", () => {
  it("resolves a real cookie session with no botAuth (human write path, not rate-limited)", async () => {
    cookieState.authUserResponse = {
      data: { user: { id: "human-1", email: "person@example.com", user_metadata: {}, is_anonymous: false } },
    };

    const result = await resolveRequestIdentity(makeRequest({}));

    expect(result).toEqual({ user: { id: "human-1", username: "person_vibe" } });
  });

  it("resolves a bearer token as botAuth when no cookie session is present (agent write path, rate-limited)", async () => {
    state.userResponse = { data: { user: { id: "agent-1", email: "", user_metadata: { full_name: "agent_abc" } } }, error: null };

    const result = await resolveRequestIdentity(makeRequest({ authorization: "Bearer good-token" }));

    expect(result?.user.id).toBe("agent-1");
    expect(result?.botAuth).toBeDefined();
  });

  it("rejects a request presenting only an anonymous session cookie with no Authorization header — this is the bypass an agent would need to route through checkAgentWriteAllowed instead", async () => {
    cookieState.authUserResponse = {
      data: { user: { id: "anon-1", email: "", user_metadata: { full_name: "agent_abc123" }, is_anonymous: true } },
    };

    const result = await resolveRequestIdentity(makeRequest({}));

    expect(result).toBeNull();
  });
});
