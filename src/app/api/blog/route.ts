import { NextResponse } from "next/server";
import { getBlogPosts, getBlogPostById } from "@/lib/db";

import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  if (id) {
    const post = await getBlogPostById(id, lang);
    if (!post) {
      return NextResponse.json({ error: "Artikel ikke fundet" }, { status: 404 });
    }
    return NextResponse.json(post);
  }

  const posts = await getBlogPosts(lang);
  return NextResponse.json(posts, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
    },
  });
}
