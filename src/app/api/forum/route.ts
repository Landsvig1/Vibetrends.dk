import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getThreads, createThread } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { pendingSubmissionBody, reviewStateForWrite } from "@/lib/reviewGate";
import { enforceAgentWriteRateLimit } from "@/lib/rate-limit";
import { threadSchema } from "@/lib/schemas";

export { threadSchema };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;
  const sort = searchParams.get("sort") === "new" ? "new" : "top";

  const threads = await getThreads({ search, category, lang: 'da', sort });
  return NextResponse.json(threads, {
    // no-store: `public, max-age` was cached by Vercel's shared edge — a
    // request from ANY client within the window got a stale pre-vote
    // upvote count regardless of the client's own cache mode (fetch's
    // `cache: "no-store"` on the caller only bypasses the browser's local
    // cache, not this shared layer). Correctness for interactive upvotes
    // matters more than the minor DB-load saving here.
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, botAuth: actingAs } = identity;

    if (actingAs) {
      const rateLimited = await enforceAgentWriteRateLimit(actingAs.user.id);
      if (rateLimited) return rateLimited;
    }

    const body = await request.json();
    if (!validateHoneypot(body)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const result = threadSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { title, category, content } = result.data;

    const thread = await createThread(title, user.username, category, content, actingAs);
    // Inert today — the forum's gate ships off, so this branch is never taken
    // (FORUM_GATE_ENABLED in lib/reviewGate.ts). Present so that turning the
    // gate on flips the API contract with it, instead of leaving the forum
    // returning 201 + the thread for a submission nobody can see.
    if (reviewStateForWrite('forum_threads', actingAs) === 'pending') {
      return NextResponse.json(pendingSubmissionBody(thread.id), { status: 202 });
    }

    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
