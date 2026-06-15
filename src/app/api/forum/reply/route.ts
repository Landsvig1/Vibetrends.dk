import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { addReply } from "@/lib/db";
import { z } from "zod";

const replySchema = z.object({
  threadId: z.string(),
  content: z.string().min(1).max(5000),
});

export async function POST(request: Request) {
  try {
    const username = request.headers.get("x-username");
    if (!username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const { threadId, content } = result.data;

    const thread = await addReply(threadId, username, content);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
