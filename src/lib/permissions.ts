// Client-side admin identity — mirrors public.is_admin()
// (supabase/migrations/20260706000000_admin_multi_upvote.sql). Used only to
// decide whether to show admin-only UI; the server re-checks via RLS on every
// mutation, so this is a display convenience, not a security boundary. If the
// admin's email or GitHub handle ever changes, update both this file and the
// SQL function — there's no single source of truth across the two languages.
export const ADMIN_EMAIL = "kasper@landsvig.com";
export const ADMIN_GITHUB_USERNAME = "landsvig1";

/**
 * Whether a signed-in user may see a delete affordance for an item — true for
 * admins, for the item's own author/developer, or for any legacy-owner match
 * a caller supplies (e.g. the "vibecoder_" placeholder-author prefix used
 * before real usernames were tracked).
 */
export function canDelete(
  user: { isAdmin: boolean; username: string } | null,
  authorField: string,
  isLegacyOwner: (author: string) => boolean = () => false
): boolean {
  if (!user) return false;
  return user.isAdmin || authorField === user.username || isLegacyOwner(authorField);
}
