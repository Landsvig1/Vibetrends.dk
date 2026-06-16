import { NextResponse } from "next/server";
import { getThreads, deleteThread, deleteReply, getDb } from "@/lib/db";

import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const threads = await getThreads(category, lang);
  return NextResponse.json(threads, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}

export async function DELETE(request: Request) {
  const username = request.headers.get("x-username");
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const replyId = searchParams.get("replyId");

  if (!threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  const db = await getDb();

  if (replyId) {
    // Authorization check for reply
    const thread = db.forum.find(t => t.id === threadId);
    const reply = thread?.replies.find(r => r.id === replyId);
    if (!reply) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }
    if (reply.author !== username) {
      return NextResponse.json({ error: "Forbidden: You do not own this reply" }, { status: 403 });
    }

    const success = await deleteReply(threadId, replyId);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Reply deleted" });
  } else {
    // Authorization check for thread
    const thread = db.forum.find(t => t.id === threadId);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    if (thread.author !== username) {
      return NextResponse.json({ error: "Forbidden: You do not own this thread" }, { status: 403 });
    }

    const success = await deleteThread(threadId);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Thread deleted" });
  }
}
