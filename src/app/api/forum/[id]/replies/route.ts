import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { addReply } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { pendingSubmissionBody, reviewStateForWrite } from "@/lib/reviewGate";
import { enforceAgentWriteRateLimit } from "@/lib/rate-limit";
import { replySchema } from "@/lib/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: threadId } = await params;
    const body = await request.json();
    if (!validateHoneypot(body)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const result = replySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const thread = await addReply(threadId, user.username, result.data.content, actingAs);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Inert today — see POST /api/forum for why this branch exists anyway.
    // `thread` is the parent thread, so the reply's own id isn't in hand here;
    // the thread id is the useful correlation handle for a queued reply.
    if (reviewStateForWrite('forum_replies', Boolean(actingAs)) === 'pending') {
      return NextResponse.json(pendingSubmissionBody(threadId), { status: 202 });
    }

    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
