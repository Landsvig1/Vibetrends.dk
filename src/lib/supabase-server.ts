import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

  const email = user.email || '';
  const baseName = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const username = (user.user_metadata?.full_name as string | undefined) || `${baseName}_vibe`;

  return { id: user.id, username };
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
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const email = user.email || '';
  const baseName = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const username = (user.user_metadata?.full_name as string | undefined) || `${baseName}_vibe`;

  return { user: { id: user.id, username }, supabase };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
