"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase";

/**
 * First-party funnel events.
 *
 * Vercel Web Analytics custom events are write-only on this project's plan
 * (the query API returns 402), so events sent with track() cannot be reported
 * on. These are mirrored into Supabase, where they can be joined against
 * users and content -- see supabase/migrations/20260830120000_analytics_events.sql.
 *
 * Writes go through the record_analytics_event RPC; the table itself is
 * RLS-locked with no policies, so the browser can append but never read,
 * update or delete.
 */

const SESSION_KEY = "vt_sid";

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
    const supabase = createSupabaseBrowserClient();
    // Fire-and-forget: telemetry must never delay or break the copy action, so
    // the promise is intentionally not awaited and its rejection is swallowed.
    void supabase
      .rpc("record_analytics_event", {
        p_event_name: eventName,
        p_item_type: payload.itemType ?? null,
        p_item_slug: payload.itemSlug ?? null,
        p_host_slug: payload.hostSlug ?? null,
        p_snippet: payload.snippet ?? null,
        p_path: typeof window !== "undefined" ? window.location.pathname : null,
        p_session_id: sessionId() ?? null,
      })
      // Two-arg then, not .catch: the Supabase builder is a PromiseLike and
      // has no .catch.
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // Missing env vars or no browser context: never surface to the user.
  }
}
