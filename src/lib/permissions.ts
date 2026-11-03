// Client-side admin identity, mirrors public.is_admin()
// (supabase/migrations/20261020100000_is_admin_server_identity.sql). Used only
// to decide whether to show admin-only UI; the server re-checks via RLS on
// every mutation, so this is a display convenience, not a security boundary.
// Admins are keyed by auth.users.id, which Supabase Auth assigns and the user
// cannot change. Never key on user_metadata (client-writable) or email. If the
// admin list changes, update both this file and the SQL function; there's no
// single source of truth across the two languages.
export const ADMIN_USER_IDS: readonly string[] = [
  "6d158da1-84e7-4c3a-8687-89167b16ceae", // kasper@landsvig.com
];
// The curator bot account (vibes-bot@vibetrends.dk). Same id as the bot
// exemption in supabase/migrations/20261021100000_content_column_integrity.sql.
export const CURATOR_BOT_USER_ID = "fa9d9c1d-b101-4813-b6e4-8e886bbdc41e";

export function isAdminUser(user: { id: string } | null | undefined): boolean {
  return !!user && ADMIN_USER_IDS.includes(user.id);
}

/**
 * Whether a user may skip the review gate and publish under reserved author
 * names: the curator bot or an admin. Keyed by user id, never email.
 */
export function isTrustedCurator(user: { id?: string } | null | undefined): boolean {
  if (!user?.id) return false;
  return user.id === CURATOR_BOT_USER_ID || ADMIN_USER_IDS.includes(user.id);
}

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
