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
 */
export async function getAuthUser(): Promise<{ id: string; username: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return { id: user.id, username: deriveUsername(user) };
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
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` }, fetch: fetchWithTimeout } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return { user: { id: user.id, username: deriveUsername(user) }, supabase };
}

/**
 * Resolve identity for a route that must accept either a browser session
 * cookie or a bearer-authenticated bot request — tries `getAuthUser()` first,
 * then falls back to `resolveBotRequestAuth()`. Used only by the two routes
 * that opt into bot writes (`/api/vibes`, `/api/skills`); does not change
 * `getAuthUser()`'s cookie-only behavior for any other caller.
 */
export async function resolveRequestIdentity(request: Request): Promise<{
  user: { id: string; username: string };
  botAuth?: { user: { id: string; username: string }; supabase: SupabaseClient };
} | null> {
  const user = await getAuthUser();
  if (user) return { user };

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
