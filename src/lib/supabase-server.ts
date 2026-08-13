import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Supabase's client has no request timeout by default — a stalled TCP
 * connection (seen intermittently on CI runners) would otherwise hang the
 * awaiting Server Component forever instead of erroring. Give every request
 * a hard ceiling well under Next's own render timeouts. */
const SUPABASE_FETCH_TIMEOUT_MS = 10000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS) });
}

export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { global: { fetch: fetchWithTimeout } }
);

/**
 * Service-role client, for server-only operations that must not be reachable
 * with a key the browser holds. Currently: the rate-limit RPCs.
 *
 * Those RPCs were `EXECUTE`-granted to `anon`, and the anon key is public by
 * design (it ships in the client bundle). Since the caller supplies both the
 * bucket key and the limit, anyone could call
 * `check_and_increment_dual_rate_limit` directly with `agentwrite:global` and
 * drive the site-wide agent-write budget to its ceiling in ~200 unauthenticated
 * requests, denying writes to every legitimate agent until the window rolled.
 * Every one of these call sites is a route handler, so nothing ever needed the
 * anon role for them.
 *
 * This client BYPASSES RLS. Use it only where that is the point. Anything
 * carrying user data or acting on a user's behalf must keep going through
 * `supabasePublic` or `createSupabaseServerClient()`, which is where RLS
 * (`auth.uid() = user_id`) is enforced.
 *
 * Lazily constructed and memoized: a module-level `createClient` would read
 * the env var at import time and bake `undefined!` into a client that fails
 * confusingly on first use. This throws where the call happens instead.
 */
let serviceRoleClient: SupabaseClient | null = null;

export function getSupabaseServiceRole(): SupabaseClient {
  if (serviceRoleClient) return serviceRoleClient;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — required for the rate-limit RPCs, ' +
        'which are no longer executable by the anon role.',
    );
  }

  serviceRoleClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    global: { fetch: fetchWithTimeout },
    // No session to persist or refresh: this client authenticates with a
    // static key and must never pick up a user session from storage.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceRoleClient;
}

/** Shared by getAuthUser() and resolveBotRequestAuth() so the fallback-username
 * rule (sanitize local-part, suffix "_vibe") only lives in one place. */
function deriveUsername(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const email = user.email || '';
  const baseName = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  return (user.user_metadata?.full_name as string | undefined) || `${baseName}_vibe`;
}

/**
 * Resolve the authenticated user from the Supabase session cookie and derive
 * the display username the same way the client AuthProvider does. Returns null
 * when there is no valid session. This is the trusted server-side identity —
 * never trust a client-supplied header for auth.
 *
 * Rejects anonymous sessions (`user.is_anonymous`) even when the cookie
 * itself is valid. Anonymous identities are only ever meant to authenticate
 * via `Authorization: Bearer` (the /api/agentauth flow), which routes through
 * resolveBotRequestAuth() and is subject to checkAgentWriteAllowed. Without
 * this check, an agent could take the same access/refresh tokens
 * POST /api/agentauth returns, repackage them as a Supabase SSR session
 * cookie instead of a bearer header, and have resolveRequestIdentity()
 * resolve them here first — leaving `botAuth` unset and every rate-limit
 * guard (`if (actingAs && ...)`) skipped entirely.
 */
export async function getAuthUser(): Promise<{ id: string; username: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;

  return { id: user.id, username: deriveUsername(user) };
}

/**
 * Resolve identity directly from a bearer access token string,
 * returning both the identity and a Supabase client configured with that token.
 */
export async function resolveBotTokenAuth(
  token: string
): Promise<{ user: { id: string; username: string }; supabase: SupabaseClient } | null> {
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${cleanToken}` }, fetch: fetchWithTimeout } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return { user: { id: user.id, username: deriveUsername(user) }, supabase };
}

/**
 * Resolve identity from an `Authorization: Bearer <access_token>` header,
 * returning both the identity and a Supabase client that carries that token
 * on every subsequent request — so RLS (`auth.uid() = user_id`) passes for
 * writes performed with the returned client, not just the identity check.
 *
 * Deliberately separate from `getAuthUser()` (the cookie-session seam shared
 * by 11+ other route handlers) so this bearer path stays isolated to the
 * routes that explicitly opt into it — see docs/decisions/2026-06-19-agent-auth.md
 * and docs/plans/2026-07-01-001-feat-add-vibe-skills-catalog-plan.md (KTD1).
 */
export async function resolveBotRequestAuth(
  request: Request
): Promise<{ user: { id: string; username: string }; supabase: SupabaseClient } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  return resolveBotTokenAuth(token);
}

/**
 * Resolve identity for a route that must accept either a browser session
 * cookie or a bearer-authenticated bot request — tries `getAuthUser()` first,
 * then checks explicitToken (if provided in tool arguments), and falls back to
 * `resolveBotRequestAuth(request)` (Authorization header).
 */
export async function resolveRequestIdentity(
  request: Request,
  explicitToken?: string
): Promise<{
  user: { id: string; username: string };
  botAuth?: { user: { id: string; username: string }; supabase: SupabaseClient };
} | null> {
  const user = await getAuthUser();
  if (user) return { user };

  if (explicitToken) {
    const botAuth = await resolveBotTokenAuth(explicitToken);
    if (botAuth) return { user: botAuth.user, botAuth };
  }

  const botAuth = await resolveBotRequestAuth(request);
  if (botAuth) return { user: botAuth.user, botAuth };

  return null;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  );
}
