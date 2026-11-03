import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, hashIp, getClientIp } from "@/lib/rate-limit";
import { getAuthUser, getSupabaseServiceRole } from "@/lib/supabase-server";

/** Events per IP per window. A real visitor copies a handful of install
 * snippets per visit; this only exists to bound how fast one source can
 * append rows to the funnel data. */
const RATE_LIMIT = 120;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/** Mirrors record_analytics_event: the same event-name allowlist and the same
 * per-field length caps the function truncates to. Unknown keys are stripped,
 * so a client cannot supply a user id. */
const eventSchema = z.object({
  name: z.enum(["copy_install", "connect_view"]),
  itemType: z.string().max(40).optional(),
  itemSlug: z.string().max(200).optional(),
  hostSlug: z.string().max(60).optional(),
  snippet: z.string().max(40).optional(),
  path: z.string().max(300).optional(),
  sessionId: z.string().max(64).optional(),
});

const noContent = () => new NextResponse(null, { status: 204 });

/**
 * First-party funnel events (see src/lib/analyticsEvents.ts). The RPC is
 * executable by service_role only, so this route is the single way in: it
 * rate-limits per IP and takes the user id from the session cookie rather
 * than from the body.
 *
 * Telemetry must never surface a failure to the visitor, so an accepted event
 * and one dropped on a server-side error both return 204. Only a malformed
 * body (400) and the rate limit (429) answer differently.
 */
export async function POST(request: Request) {
  try {
    const withinLimit = await checkRateLimit(
      `events:${hashIp(getClientIp(request))}`,
      RATE_LIMIT,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!withinLimit) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch {
    return noContent();
  }

  // sendBeacon posts a string body as text/plain, so parse the text rather
  // than relying on request.json() and the content type.
  let parsed;
  try {
    parsed = eventSchema.safeParse(JSON.parse(await request.text()));
  } catch {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  const event = parsed.data;

  try {
    const user = await getAuthUser().catch(() => null);
    await getSupabaseServiceRole().rpc("record_analytics_event", {
      p_event_name: event.name,
      p_item_type: event.itemType ?? null,
      p_item_slug: event.itemSlug ?? null,
      p_host_slug: event.hostSlug ?? null,
      p_snippet: event.snippet ?? null,
      p_path: event.path ?? null,
      p_session_id: event.sessionId ?? null,
      // Only sent when there is a user, so anonymous visitors' events keep
      // matching the pre-p_user_id signature during rollout.
      ...(user ? { p_user_id: user.id } : {}),
    });
  } catch {
    // Dropped, not surfaced.
  }
  return noContent();
}
