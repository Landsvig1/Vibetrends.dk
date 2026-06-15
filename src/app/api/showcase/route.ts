import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getProjects, createProject, deleteProject, getDb } from "@/lib/db";
import { z } from "zod";

const projectSchema = z.object({
  title: z.string().min(1).max(100),
  author: z.string().optional(),
  description: z.string().min(10).max(500),
  tools: z.array(z.string()).max(10).optional(),
  prompts: z.array(z.string()).optional(),
  demoUrl: z.string().url().max(200).optional().or(z.literal("")),
  githubUrl: z.string().url().max(200).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;

  const projects = await getProjects(search);
  return NextResponse.json(projects, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}

export async function POST(request: Request) {
  try {
    const username = request.headers.get("x-username");
    if (!username) {
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

    const { title, author, description, tools, prompts, demoUrl, githubUrl } = result.data;

    const project = await createProject(
      title,
      author || username,
      description,
      tools || [],
      prompts || [],
      demoUrl || "",
      githubUrl
    );

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const username = request.headers.get("x-username");
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("projectId");

  if (!id) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  // Authorization check
  const db = await getDb();
  const project = db.showcase.find(p => p.id === id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  
  if (project.author !== username) {
    return NextResponse.json({ error: "Forbidden: You do not own this project" }, { status: 403 });
  }

  const success = await deleteProject(id);
  if (!success) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Project deleted" });
}
