import { NextResponse } from "next/server";
import { getProjects, createProject, deleteProject } from "@/lib/db";

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
    const { title, author, description, tools, prompts, demoUrl, githubUrl } = await request.json();

    if (!title || !description) {
      return NextResponse.json(
        { error: "Manglende påkrævede felter (title, description)" },
        { status: 400 }
      );
    }

    const project = await createProject(
      title,
      author || "Anonym",
      description,
      tools || [],
      prompts || [],
      demoUrl || "",
      githubUrl
    );

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("projectId");

  if (!id) {
    return NextResponse.json({ error: "projectId er påkrævet" }, { status: 400 });
  }

  const success = await deleteProject(id);
  if (!success) {
    return NextResponse.json({ error: "Projektet blev ikke fundet" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Projekt slettet" });
}
