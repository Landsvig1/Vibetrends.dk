import { NextResponse } from "next/server";
import { upvoteReply } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; replyId: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId, replyId } = await params;
  const upvotes = await upvoteReply(replyId, threadId);
  if (upvotes === null) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, upvotes });
}
