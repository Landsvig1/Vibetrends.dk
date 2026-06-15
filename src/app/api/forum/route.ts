import { NextResponse } from "next/server";
import { getThreads, deleteThread, deleteReply } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;

  const threads = await getThreads(category);
  return NextResponse.json(threads, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const replyId = searchParams.get("replyId");

  if (!threadId) {
    return NextResponse.json({ error: "threadId er påkrævet" }, { status: 400 });
  }

  if (replyId) {
    // Delete reply
    const success = await deleteReply(threadId, replyId);
    if (!success) {
      return NextResponse.json({ error: "Svar blev ikke fundet" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Svar slettet" });
  } else {
    // Delete thread
    const success = await deleteThread(threadId);
    if (!success) {
      return NextResponse.json({ error: "Tråden blev ikke fundet" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Tråd slettet" });
  }
}
