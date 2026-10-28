import { NextResponse } from "next/server";
import { RESERVED_AUTHOR_MESSAGE } from "@/lib/reservedNames";

// Content-table inserts can be refused by DB triggers: a reserved author name
// (SQLSTATE 22023) or the per-user insert backstop (P0001). db.ts rethrows
// those as ContentWriteError so routes can answer 400/429 instead of a generic
// failure. Kept out of db.ts because route tests mock that module wholesale.
export type ContentWriteErrorKind = "reserved_author" | "rate_limited";

export class ContentWriteError extends Error {
  constructor(readonly kind: ContentWriteErrorKind) {
    super(kind);
    this.name = "ContentWriteError";
  }
}

const DB_ERRORS: Record<ContentWriteErrorKind, string> = {
  reserved_author: "22023",
  rate_limited: "P0001",
};

/** The ContentWriteError a PostgREST error stands for, or null. */
export function contentWriteErrorFrom(
  error: { code?: string; message?: string } | null | undefined
): ContentWriteError | null {
  if (!error) return null;
  for (const kind of Object.keys(DB_ERRORS) as ContentWriteErrorKind[]) {
    if (error.code === DB_ERRORS[kind] && error.message === kind) return new ContentWriteError(kind);
  }
  return null;
}

/** REST response for a ContentWriteError, or null for any other error. */
export function contentWriteErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof ContentWriteError)) return null;
  return error.kind === "reserved_author"
    ? NextResponse.json({ error: RESERVED_AUTHOR_MESSAGE }, { status: 400 })
    : NextResponse.json({ error: "Too many requests" }, { status: 429 });
}
