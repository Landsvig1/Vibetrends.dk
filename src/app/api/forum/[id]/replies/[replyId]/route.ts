import { NextResponse } from "next/server";
import { deleteReply } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; replyId: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId, replyId } = await params;

  // Ownership is enforced by RLS; a false result means not found or not owned.
  const deleted = await deleteReply(threadId, replyId);
  if (!deleted) {
    return NextResponse.json({ error: "Reply not found or not owned" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Reply deleted" });
}
