import { NextResponse } from "next/server";
import { deleteBlogPost } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Admin-only is enforced by RLS; a false result means not found or not admin.
  const deleted = await deleteBlogPost(id);
  if (!deleted) {
    return NextResponse.json({ error: "Blog post not found or not permitted" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Blog post deleted" });
}
