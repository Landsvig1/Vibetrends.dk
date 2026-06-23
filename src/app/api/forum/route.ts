import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getThreads, createThread } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { z } from "zod";

const threadSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.enum(["General", "Prompts", "Showcase Discussion", "Setup & Config"]),
  content: z.string().min(10).max(5000),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const sort = searchParams.get("sort") === "new" ? "new" : "top";

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const threads = await getThreads(category, lang, undefined, sort);
  return NextResponse.json(threads, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!validateHoneypot(body)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const result = threadSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { title, category, content } = result.data;

    const thread = await createThread(title, user.username, category, content);
    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
