import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRole: () => ({ rpc }),
}));

import { GET } from "../route";

/**
 * The failure modes that matter for a monitor are the quiet ones: running for
 * an unauthenticated caller, reporting success when something is wrong, and
 * treating "could not check" as "nothing to report".
 */

const SECRET = "cron-secret-value";
const PING = "https://hc-ping.com/00000000-0000-0000-0000-000000000000";

const HEALTHY = {
  is_admin_reads_client_data: 0,
  is_admin_uuid_count: 1,
  server_only_functions_exposed: 0,
  content_guard_triggers: 12,
  review_select_policies_ungated: 0,
  review_update_policies_allow_anon: 0,
  tables_without_rls: 0,
  definer_functions_without_search_path: 0,
  anon_users_24h: 0,
  max_dbwrite_bucket_24h: 0,
  fresh_account_forum_posts_24h: 0,
  pending_rows: 0,
};

const request = (auth = `Bearer ${SECRET}`) =>
  new Request("https://vibetrends.dk/api/cron/security-health", { headers: { authorization: auth } });

const fetchMock = vi.fn();
const pingedUrl = () => fetchMock.mock.calls[0][0];
const pingedBody = () => fetchMock.mock.calls[0][1].body as string;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("HEALTHCHECK_PING_URL", PING);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  rpc.mockResolvedValue({ data: HEALTHY, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/cron/security-health", () => {
  it("rejects a caller without the cron secret and never queries the DB or pings", async () => {
    const response = await GET(request("Bearer wrong"));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects everyone when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
  });

  it("sends a success ping when every check passes", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(pingedUrl()).toBe(PING);
    expect(pingedBody()).toMatch(/^vibetrends security: all checks passed/);
  });

  it("pings /fail with the failing check in the body", async () => {
    rpc.mockResolvedValue({ data: { ...HEALTHY, server_only_functions_exposed: 1 }, error: null });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ failed: 1 });
    expect(pingedUrl()).toBe(`${PING}/fail`);
    expect(pingedBody()).toMatch(/FAIL .*Server-only RPCs/);
  });

  it("pings /fail and returns 500 when the check itself cannot run", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function public.security_health() does not exist" } });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(pingedUrl()).toBe(`${PING}/fail`);
    expect(pingedBody()).toMatch(/could not run: function public.security_health\(\) does not exist/);
  });

  it("returns 500 when the ping cannot be delivered", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "ping_failed" });
  });

  it("returns 500 without pinging when HEALTHCHECK_PING_URL is missing", async () => {
    vi.stubEnv("HEALTHCHECK_PING_URL", "");
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
