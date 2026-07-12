import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, hashIp, getClientIp } from "@/lib/rate-limit";

/** Token issuances per IP per window — the load-bearing cost control (KTD4).
 * Each issuance is a real Supabase anonymous auth.users row, which is
 * MAU-billed, so this bounds the rate of new rows, not just request volume. */
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/**
 * Auto-provisions a Supabase anonymous identity and returns a bearer access
 * token usable on every write route that already accepts `Authorization:
 * Bearer <token>` (resolveRequestIdentity/resolveBotRequestAuth in
 * src/lib/supabase-server.ts). No email/password, no signup UI — this
 * replaces the manual bot-account flow `add-vibe`'s bot-auth.mjs used.
 *
 * RLS is never bypassed: the returned token is a real Supabase session, so
 * every subsequent write still requires `auth.uid() = user_id` exactly like
 * a human-authenticated request. This endpoint automates getting a valid
 * identity, not writing without one — see plan KTD1.
 *
 * Requires `enable_anonymous_sign_ins` to be enabled on the Supabase
 * project's Auth settings (dashboard, not code — see plan KTD2). Without it,
 * signInAnonymously fails and this route returns 503.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const withinLimit = await checkRateLimit(
    `agentauth:${hashIp(ip)}`,
    RATE_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS
  );

  if (!withinLimit) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // A non-degenerate username (KTD3) — deriveUsername() in supabase-server.ts
  // falls back to the generic "_vibe" suffix when user.email is empty, which
  // every anonymous user's is. Setting full_name here avoids every agent
  // submission attributing to the same generic name.
  const agentId = crypto.randomUUID().slice(0, 8);
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { full_name: `agent_${agentId}` } },
  });

  if (error || !data.session) {
    return NextResponse.json(
      {
        error:
          "Failed to provision agent identity. If this persists, anonymous sign-in may not be enabled on this Supabase project.",
      },
      { status: 503 }
    );
  }

  // Never return the refresh token — short-lived-only reduces the blast
  // radius of a leaked response; the access token is all any write route needs.
  return NextResponse.json(
    {
      access_token: data.session.access_token,
      token_type: "bearer",
      expires_in: data.session.expires_in,
    },
    { status: 201 }
  );
}
