import { NextResponse } from "next/server";
import { isAdminUser, isTrustedBotEmail } from "@/lib/permissions";

// Author names only the admin and the curator bot may publish under. Mirrors
// the list in the DB's content-integrity trigger; if it changes, update both.
// Stored lowercase and trimmed, compared against lowercase trimmed input.
export const RESERVED_AUTHOR_NAMES: ReadonlySet<string> = new Set([
  "landsvig1",
  "kasper",
  "kasperlandsvig",
  "kasper_landsvig",
  "admin",
  "administrator",
  "moderator",
  "vibetrends",
  "vibetrends_dk",
  "vibes-bot",
  "vibes_bot",
  "system",
  // The curator bot's own display name (its full_name in auth.users).
  "vibetrends bot",
]);

export function isReservedAuthor(name: string): boolean {
  return RESERVED_AUTHOR_NAMES.has(name.trim().toLowerCase());
}

export function mayUseReservedAuthor(user: { id: string; email?: string | null }): boolean {
  return isAdminUser(user) || isTrustedBotEmail(user.email);
}

export const RESERVED_AUTHOR_MESSAGE = "This author name is reserved";

/** 400 when `user` would publish under a reserved name it may not use, else null. */
export function reservedAuthorResponse(user: { id: string; email?: string | null; username: string }): NextResponse | null {
  if (!isReservedAuthor(user.username) || mayUseReservedAuthor(user)) return null;
  return NextResponse.json({ error: RESERVED_AUTHOR_MESSAGE }, { status: 400 });
}
