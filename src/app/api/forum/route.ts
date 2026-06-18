import { NextResponse } from "next/server";
import { getThreads, deleteThread, deleteReply } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";

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
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const replyId = searchParams.get("replyId");

  if (!threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  // Ownership is enforced by RLS; a false result means not found or not owned.
  if (replyId) {
    const deleted = await deleteReply(threadId, replyId);
    if (!deleted) {
      return NextResponse.json({ error: "Reply not found or not owned" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Reply deleted" });
  } else {
    const deleted = await deleteThread(threadId);
    if (!deleted) {
      return NextResponse.json({ error: "Thread not found or not owned" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Thread deleted" });
  }
}
