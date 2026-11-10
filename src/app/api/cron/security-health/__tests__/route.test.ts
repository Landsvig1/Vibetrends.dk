import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRole: () => ({ rpc }),
}));

import { GET } from "../route";

/**
 * The failure modes that matter for a monitor are the quiet ones: running for
 * an unauthenticated caller, skipping the mail when something is wrong, and
 * treating "could not check" as "nothing to report".
 */

const SECRET = "cron-secret-value";
const TUESDAY = new Date("2026-11-10T06:00:00Z");
const MONDAY = new Date("2026-11-09T06:00:00Z");

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TUESDAY);
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("HEALTH_ALERT_TO", "owner@example.com");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  rpc.mockResolvedValue({ data: HEALTHY, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const mailSubject = () => JSON.parse(fetchMock.mock.calls[0][1].body).subject;

describe("GET /api/cron/security-health", () => {
  it("rejects a caller without the cron secret and never queries the DB", async () => {
    const response = await GET(request("Bearer wrong"));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects everyone when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
  });

  it("stays quiet on a healthy weekday", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ failed: 0, mailed: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the all-clear heartbeat on Monday", async () => {
    vi.setSystemTime(MONDAY);
    await GET(request());
    expect(mailSubject()).toBe("vibetrends security: all checks passed");
  });

  it("mails on any failed check, whatever the day", async () => {
    rpc.mockResolvedValue({ data: { ...HEALTHY, server_only_functions_exposed: 1 }, error: null });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ failed: 1, mailed: true });
    expect(mailSubject()).toBe("vibetrends security: 1 check failed");
  });

  it("mails and returns 500 when the check itself cannot run", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function public.security_health() does not exist" } });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(mailSubject()).toBe("vibetrends security: health check could not run");
  });

  it("returns 500 when the alert cannot be delivered", async () => {
    rpc.mockResolvedValue({ data: { ...HEALTHY, tables_without_rls: 1 }, error: null });
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "mail_failed" });
  });
});
