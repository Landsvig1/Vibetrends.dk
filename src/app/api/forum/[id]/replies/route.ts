import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { addReply } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { checkAgentWriteAllowed } from "@/lib/rate-limit";
import { z } from "zod";

const replySchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, botAuth: actingAs } = identity;

    if (actingAs) {
      let withinLimit: boolean;
      try {
        withinLimit = await checkAgentWriteAllowed(actingAs.user.id);
      } catch {
        return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
      }
      if (!withinLimit) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
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

    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
