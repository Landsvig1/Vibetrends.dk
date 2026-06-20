import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getSkills, createSkill } from "@/lib/db";
import { getAuthUser } from "@/lib/supabase-server";
import { TOPIC_SLUGS } from "@/lib/topics";
import { z } from "zod";

const skillSchema = z.object({
  title: z.string().min(1).max(100),
  category: z.enum(TOPIC_SLUGS),
  description: z.string().min(10).max(1000),
  tags: z.array(z.string()).max(10).optional(),
  githubUrl: z.string().url().max(200).optional().or(z.literal("")),
});

import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;
  const viewParam = searchParams.get("view");
  const view = viewParam === "hot" || viewParam === "trending" ? viewParam : undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const skills = await getSkills(search, category, lang, view);
  return NextResponse.json(skills, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
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
    const result = skillSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { title, category, description, tags, githubUrl } = result.data;

    const newSkill = await createSkill(
      title,
      user.username,
      description,
      category,
      tags || [],
      githubUrl || undefined
    );

    return NextResponse.json(newSkill, { status: 201 });
  } catch (error) {
    console.error('Failed to create skill API:', error);
    return NextResponse.json({ error: "Invalid JSON payload or creation failed" }, { status: 400 });
  }
}
