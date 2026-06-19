import { NextResponse } from "next/server";
import { deleteThread } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Ownership is enforced by RLS; a false result means not found or not owned.
  const deleted = await deleteThread(id);
  if (!deleted) {
    return NextResponse.json({ error: "Thread not found or not owned" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Thread deleted" });
}
