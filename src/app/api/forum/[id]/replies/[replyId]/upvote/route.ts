import { NextResponse } from "next/server";
import { upvoteReply } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { checkAgentWriteAllowed } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; replyId: string }> }
) {
  const identity = await resolveRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { botAuth: actingAs } = identity;

  if (actingAs && !(await checkAgentWriteAllowed(actingAs.user.id))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id: threadId, replyId } = await params;
  const upvotes = await upvoteReply(replyId, threadId, actingAs);
  if (upvotes === 'rpc_error') {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  if (upvotes === null) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, upvotes });
}
