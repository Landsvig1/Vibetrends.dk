import { describe, it, expect } from "vitest";
import { evaluateHealth, formatReport, isHeartbeatDay } from "@/lib/securityHealth";

/** The live snapshot from 2026-11-10: every invariant holds, no traffic. */
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

const failedKeys = (snapshot: Record<string, number>) =>
  evaluateHealth(snapshot).filter((c) => !c.ok).map((c) => c.key);

describe("evaluateHealth", () => {
  it("passes the healthy live snapshot", () => {
    expect(failedKeys(HEALTHY)).toEqual([]);
  });

  it.each([
    ["is_admin_reads_client_data", 1],
    ["is_admin_uuid_count", 2],
    ["is_admin_uuid_count", 0],
    ["server_only_functions_exposed", 1],
    ["content_guard_triggers", 11],
    ["review_select_policies_ungated", 1],
    ["review_update_policies_allow_anon", 1],
    ["tables_without_rls", 1],
    ["definer_functions_without_search_path", 1],
  ])("fails drift on any deviation: %s = %i", (key, value) => {
    expect(failedKeys({ ...HEALTHY, [key]: value })).toEqual([key]);
  });

  it.each([
    ["anon_users_24h", 15, 16],
    ["max_dbwrite_bucket_24h", 39, 40],
    ["fresh_account_forum_posts_24h", 10, 11],
    ["pending_rows", 25, 26],
  ])("volume %s passes at %i and fails at %i", (key, okValue, badValue) => {
    expect(failedKeys({ ...HEALTHY, [key]: okValue })).toEqual([]);
    expect(failedKeys({ ...HEALTHY, [key]: badValue })).toEqual([key]);
  });

  it("fails a check whose number is missing instead of passing it silently", () => {
    const rest: Record<string, number> = { ...HEALTHY };
    delete rest.content_guard_triggers;
    const check = evaluateHealth(rest).find((c) => c.key === "content_guard_triggers");
    expect(check).toMatchObject({ ok: false, value: null });
  });
});

describe("isHeartbeatDay", () => {
  it("is Monday in UTC only", () => {
    expect(isHeartbeatDay(new Date("2026-11-09T06:00:00Z"))).toBe(true);
    expect(isHeartbeatDay(new Date("2026-11-10T06:00:00Z"))).toBe(false);
  });
});

describe("formatReport", () => {
  it("names the failure count in the subject and lists failures first", () => {
    const { subject, text } = formatReport(evaluateHealth({ ...HEALTHY, tables_without_rls: 2 }));
    expect(subject).toBe("vibetrends security: 1 check failed");
    expect(text.split("\n")[2]).toMatch(/^FAIL .*RLS disabled: 2 \(expected 0\)$/);
  });

  it("reads as an all-clear when nothing failed", () => {
    expect(formatReport(evaluateHealth(HEALTHY)).subject).toBe("vibetrends security: all checks passed");
  });
});
