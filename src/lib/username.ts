/**
 * The display username written as a content row's author. Shared by the
 * server (supabase-server.ts) and the client AuthProvider so both agree.
 *
 * Anonymous agent sessions get `agent_<first 8 chars of the user id>`. The id
 * is assigned by Supabase Auth; user_metadata is client-writable, so an
 * anonymous caller's full_name is ignored. The DB enforces the same formula on
 * insert. Everyone else keeps the full_name, else `<email local-part>_vibe`.
 */
export function deriveUsername(user: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown>;
}): string {
  if (user.is_anonymous) return `agent_${user.id.slice(0, 8)}`;
  const email = user.email || "";
  const baseName = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "_");
  return (user.user_metadata?.full_name as string | undefined) || `${baseName}_vibe`;
}
