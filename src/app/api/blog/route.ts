import { NextResponse } from "next/server";
import { getBlogPosts, getBlogPostById, createBlogPost } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { validateHoneypot } from "@/lib/honeypot";
import { z } from "zod";
import { BLOG_CATEGORIES } from "@/lib/blogCategories";

import { cookies } from "next/headers";

export const blogPostSchema = z.object({
  title: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  // author is derived from the authenticated identity (user.username), not the
  // request body — mirrors how createProject/createSkill work.
  readTime: z.string().min(1).max(50),
  publishedAt: z.string().min(1).max(50),
  imageUrl: z.string().url().max(500),
  category: z.enum(BLOG_CATEGORIES),
});

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

export async function POST(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, botAuth: actingAs } = identity;

    const body = await request.json();
    if (!validateHoneypot(body)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const result = blogPostSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { title, excerpt, content, readTime, publishedAt, imageUrl, category } = result.data;

    const post = await createBlogPost(
      title,
      excerpt,
      content,
      user.username,
      readTime,
      publishedAt,
      imageUrl,
      category,
      actingAs
    );

    return NextResponse.json(post, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
