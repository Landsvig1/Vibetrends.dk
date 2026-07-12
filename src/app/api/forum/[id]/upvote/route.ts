import { NextResponse } from "next/server";
import { upvoteThread } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { enforceAgentWriteRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { botAuth: actingAs } = identity;

  if (actingAs) {
    const rateLimited = await enforceAgentWriteRateLimit(actingAs.user.id);
    if (rateLimited) return rateLimited;
  }

  const { id } = await params;
  const upvotes = await upvoteThread(id, actingAs);
  if (upvotes === 'rpc_error') {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  if (upvotes === null) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, upvotes });
}
