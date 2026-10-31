import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { addReply } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { pendingSubmissionBody, reviewStateForWrite } from "@/lib/reviewGate";
import { enforceWriteRateLimit } from "@/lib/rate-limit";
import { reservedAuthorResponse } from "@/lib/reservedNames";
import { contentWriteErrorResponse } from "@/lib/contentWriteErrors";
import { replySchema } from "@/lib/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, botAuth: actingAs } = identity;

    const reserved = reservedAuthorResponse(user);
    if (reserved) return reserved;

    const rateLimited = await enforceWriteRateLimit(identity);
    if (rateLimited) return rateLimited;

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

    const added = await addReply(threadId, user.username, result.data.content, actingAs);
    if (!added) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (reviewStateForWrite('forum_replies', actingAs) === 'pending') {
      return NextResponse.json(pendingSubmissionBody(added.replyId), { status: 202 });
    }

    return NextResponse.json(added.thread, { status: 201 });
  } catch (error) {
    const refused = contentWriteErrorResponse(error);
    if (refused) return refused;
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
