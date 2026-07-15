import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getProjects, createProject } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { enforceAgentWriteRateLimit } from "@/lib/rate-limit";
import { projectSchema } from "@/lib/schemas";
export { projectSchema };

import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const sortParam = searchParams.get("sort");
  const sort = sortParam === "top" || sortParam === "az" ? sortParam : "new";

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const projects = await getProjects(search, lang, sort);
  return NextResponse.json(projects, {
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

    if (actingAs) {
      const rateLimited = await enforceAgentWriteRateLimit(actingAs.user.id);
      if (rateLimited) return rateLimited;
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
