import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
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
