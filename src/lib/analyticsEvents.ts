"use client";

/**
 * First-party funnel events.
 *
 * Vercel Web Analytics custom events are write-only on this project's plan
 * (the query API returns 402), so events sent with track() cannot be reported
 * on. These are mirrored into Supabase, where they can be joined against
 * users and content -- see supabase/migrations/20260830120000_analytics_events.sql.
 *
 * Events are posted to /api/events, which rate-limits per IP and calls the
 * record_analytics_event RPC with the service role. The browser has no
 * direct access to the RPC or the table.
 */

const SESSION_KEY = "vt_sid";
const ENDPOINT = "/api/events";

/**
 * Per-tab id used to count one visit's copies once. Deliberately
 * sessionStorage, not a cookie: it dies with the tab, is never sent to any
 * other origin, and carries nothing identifying, which keeps this outside
 * consent-banner territory.
 */
function sessionId(): string | undefined {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Math.random()).slice(2);
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // Private mode or storage disabled: the event is still worth recording
    // without a session id.
    return undefined;
  }
}

export type AnalyticsEventName = "copy_install" | "connect_view";

export function recordAnalyticsEvent(
  eventName: AnalyticsEventName,
  payload: {
    itemType?: string;
    itemSlug?: string;
    hostSlug?: string;
    snippet?: string;
  } = {},
): void {
  try {
    const body = JSON.stringify({
      name: eventName,
      itemType: payload.itemType,
      itemSlug: payload.itemSlug,
      hostSlug: payload.hostSlug,
      snippet: payload.snippet,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      sessionId: sessionId(),
    });
    // Fire-and-forget: telemetry must never delay or break the copy action.
    // sendBeacon survives the page unloading right after a copy; fetch with
    // keepalive is the fallback where it is missing or refuses the payload.
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(ENDPOINT, body)) return;
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true }).catch(() => undefined);
  } catch {
    // No browser context: never surface to the user.
  }
}
