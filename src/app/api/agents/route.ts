import { NextResponse } from "next/server";
import { getAgents, createAgent, deleteAgent } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;

  const agents = await getAgents(search, category);
  return NextResponse.json(agents, {
    headers: {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=5",
    },
  });
}

export async function POST(request: Request) {
  try {
    const { name, developer, category, description, installCommand, systemPrompt, tags } = await request.json();

    if (!name || !description || !category) {
      return NextResponse.json(
        { error: "Manglende påkrævede felter (name, description, category)" },
        { status: 400 }
      );
    }

    const agent = await createAgent(
      name,
      developer || "Anonym",
      category,
      description,
      installCommand || "",
      systemPrompt || "",
      tags || []
    );

    return NextResponse.json(agent, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("agentId");

  if (!id) {
    return NextResponse.json({ error: "agentId er påkrævet" }, { status: 400 });
  }

  const success = await deleteAgent(id);
  if (!success) {
    return NextResponse.json({ error: "Agenten blev ikke fundet" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Agent slettet" });
}
