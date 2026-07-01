import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getProjects, createProject } from "@/lib/db";
import { getAuthUser, resolveBotRequestAuth } from "@/lib/supabase-server";
import { z } from "zod";

export const projectSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  tools: z.array(z.string()).max(10).optional(),
  prompts: z.array(z.string()).optional(),
  demoUrl: z.string().url().max(200).optional().or(z.literal("")),
  githubUrl: z.string().url().max(200).optional(),
  imageUrl: z.string().url().max(300).optional().or(z.literal("")),
});

import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const projects = await getProjects(search, lang);
  return NextResponse.json(projects, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}

export async function POST(request: Request) {
  try {
    let user = await getAuthUser();
    let actingAs: Parameters<typeof createProject>[8];

    if (!user) {
      const botAuth = await resolveBotRequestAuth(request);
      if (botAuth) {
        user = botAuth.user;
        actingAs = botAuth;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!validateHoneypot(body)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const result = projectSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { title, description, tools, prompts, demoUrl, githubUrl, imageUrl } = result.data;

    const project = await createProject(
      title,
      user.username,
      description,
      tools || [],
      prompts || [],
      demoUrl || "",
      githubUrl,
      imageUrl || undefined,
      actingAs
    );

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
