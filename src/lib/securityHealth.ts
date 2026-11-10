/**
 * Thresholds and wording for the daily security health check.
 *
 * `public.security_health()` (migration 20261110100000) returns raw numbers;
 * this module decides which of them are alarming. Keeping the judgement here
 * means a threshold can be tuned and tested without touching the database.
 *
 * Two kinds of check:
 * - "drift": an invariant from AGENTS.md "Security invariants" no longer
 *   holds. Any deviation is a failure, there is no tolerance.
 * - "volume": activity over the last 24 hours above what this site normally
 *   sees. The limits are first guesses from Nov 2026 volumes (about one new
 *   anonymous account a month, an empty review queue) and are meant to be
 *   tuned once a few weeks of heartbeats exist.
 */

export type HealthSnapshot = Record<string, number>;

export interface HealthCheck {
  key: string;
  kind: "drift" | "volume";
  label: string;
  value: number | null;
  ok: boolean;
  expected: string;
}

interface Rule {
  key: string;
  kind: HealthCheck["kind"];
  label: string;
  expected: string;
  ok: (value: number) => boolean;
}

const RULES: Rule[] = [
  {
    key: "is_admin_reads_client_data",
    kind: "drift",
    label: "is_admin() reads metadata, email or JWT claims",
    expected: "0",
    ok: (v) => v === 0,
  },
  {
    key: "is_admin_uuid_count",
    kind: "drift",
    label: "Admin uuids in is_admin()",
    expected: "1",
    ok: (v) => v === 1,
  },
  {
    key: "server_only_functions_exposed",
    kind: "drift",
    label: "Server-only RPCs executable by anon or authenticated",
    expected: "0",
    ok: (v) => v === 0,
  },
  {
    key: "content_guard_triggers",
    kind: "drift",
    label: "Guard and insert-cap triggers on content tables",
    expected: "12",
    ok: (v) => v === 12,
  },
  {
    key: "review_select_policies_ungated",
    kind: "drift",
    label: "SELECT policies on reviewed tables without a review_state gate",
    expected: "0",
    ok: (v) => v === 0,
  },
  {
    key: "review_update_policies_allow_anon",
    kind: "drift",
    label: "UPDATE policies on reviewed tables open to anonymous callers",
    expected: "0",
    ok: (v) => v === 0,
  },
  {
    key: "tables_without_rls",
    kind: "drift",
    label: "Public tables with RLS disabled",
    expected: "0",
    ok: (v) => v === 0,
  },
  {
    key: "definer_functions_without_search_path",
    kind: "drift",
    label: "Security definer functions without a pinned search_path",
    expected: "0",
    ok: (v) => v === 0,
  },
  {
    key: "anon_users_24h",
    kind: "volume",
    label: "New anonymous accounts, last 24h",
    expected: "15 or fewer",
    ok: (v) => v <= 15,
  },
  {
    // The DB insert cap is 40/h per user. Reaching it means one account is
    // writing at the ceiling, which app traffic never does.
    key: "max_dbwrite_bucket_24h",
    kind: "volume",
    label: "Most inserts by one account in one hour, last 24h",
    expected: "under 40 (the DB cap)",
    ok: (v) => v < 40,
  },
  {
    key: "fresh_account_forum_posts_24h",
    kind: "volume",
    label: "Forum posts from accounts under a day old, last 24h",
    expected: "10 or fewer",
    ok: (v) => v <= 10,
  },
  {
    key: "pending_rows",
    kind: "volume",
    label: "Rows waiting for review",
    expected: "25 or fewer",
    ok: (v) => v <= 25,
  },
];

/**
 * Judge a snapshot. A key the snapshot lacks fails rather than passes: a
 * missing number means the SQL and this file disagree, and silence there is
 * exactly how a monitor stops monitoring.
 */
export function evaluateHealth(snapshot: HealthSnapshot): HealthCheck[] {
  return RULES.map((rule) => {
    const raw = snapshot[rule.key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    return {
      key: rule.key,
      kind: rule.kind,
      label: rule.label,
      expected: rule.expected,
      value,
      ok: value !== null && rule.ok(value),
    };
  });
}

/** Monday in UTC, the day an all-clear heartbeat goes out. */
export function isHeartbeatDay(now: Date): boolean {
  return now.getUTCDay() === 1;
}

export function formatReport(checks: HealthCheck[]): { subject: string; text: string } {
  const failed = checks.filter((c) => !c.ok);
  const subject = failed.length
    ? `vibetrends security: ${failed.length} check${failed.length === 1 ? "" : "s"} failed`
    : "vibetrends security: all checks passed";

  const line = (c: HealthCheck) =>
    `${c.ok ? "ok  " : "FAIL"}  [${c.kind}] ${c.label}: ${c.value ?? "missing"} (expected ${c.expected})`;

  const text = [
    failed.length
      ? "Drift failures mean a security fix was undone. Volume failures mean unusual activity in the last 24 hours."
      : "Weekly heartbeat. Nothing tripped.",
    "",
    ...failed.map(line),
    ...(failed.length ? [""] : []),
    ...checks.filter((c) => c.ok).map(line),
  ].join("\n");

  return { subject, text };
}
