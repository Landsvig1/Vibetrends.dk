import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getSkills, createSkill, parseSkillView } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { checkAgentWriteRateLimit } from "@/lib/rate-limit";
import { SKILL_CATEGORY_SLUGS } from "@/lib/skillCategories";
import { z } from "zod";

export const skillSchema = z.object({
  title: z.string().min(1).max(100),
  category: z.enum(SKILL_CATEGORY_SLUGS),
  // Only title + link are essential. Description is optional (empty allowed).
  description: z.string().max(1000).optional().or(z.literal("")),
  tags: z.array(z.string()).max(10).optional(),
  githubUrl: z.string().url().max(200),
  // Attribution for bot-imported skills (e.g. the source repo URL). Optional —
  // human submissions via the web form don't set this. Mirrors githubUrl's
  // sibling fields (demoUrl/imageUrl) in accepting "" as "not provided".
  source: z.string().url().max(300).optional().or(z.literal("")),
});

import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;
  const view = parseSkillView(searchParams.get("view"));

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const skills = await getSkills(search, category, lang, view);
  return NextResponse.json(skills, {
    // no-store: `public, max-age` was cached by Vercel's shared edge — a
    // request from ANY client within the window got a stale pre-vote
    // upvote count regardless of the client's own cache mode (fetch's
    // `cache: "no-store"` on the caller only bypasses the browser's local
    // cache, not this shared layer). Correctness for interactive upvotes
    // matters more than the minor DB-load saving here.
    headers: {
      "Cache-Control": "no-store",
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

    if (actingAs && !(await checkAgentWriteRateLimit(actingAs.user.id))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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

    const { title, category, description, tags, githubUrl, source } = result.data;

    const newSkill = await createSkill(
      title,
      user.username,
      description || "",
      category,
      tags || [],
      githubUrl,
      source || undefined,
      actingAs
    );

    return NextResponse.json(newSkill, { status: 201 });
  } catch (error) {
    console.error('Failed to create skill API:', error);
    return NextResponse.json({ error: "Invalid JSON payload or creation failed" }, { status: 400 });
  }
}
