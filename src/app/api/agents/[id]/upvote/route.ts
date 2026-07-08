import { NextResponse } from "next/server";
import { upvoteAgent } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const upvotes = await upvoteAgent(id);
  if (upvotes === 'rpc_error') {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  if (upvotes === null) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, upvotes });
}
