import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getAgents, createAgent, deleteAgent, getDb } from "@/lib/db";
import { z } from "zod";

const agentSchema = z.object({
  name: z.string().min(1).max(100),
  developer: z.string().optional(),
  category: z.enum(["DevTools", "Writing", "Browsing", "MCP Server"]),
  description: z.string().min(10).max(500),
  installCommand: z.string().optional(),
  systemPrompt: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
});

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
    const username = request.headers.get("x-username");
    if (!username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!validateHoneypot(body)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const result = agentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { name, developer, category, description, installCommand, systemPrompt, tags } = result.data;

    const agent = await createAgent(
      name,
      developer || username,
      category,
      description,
      installCommand || "",
      systemPrompt || "",
      tags || []
    );

    return NextResponse.json(agent, { status: 201 });
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
  const id = searchParams.get("agentId");

  if (!id) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  // Authorization check
  const db = await getDb();
  const agent = db.agents.find(a => a.id === id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  
  if (agent.developer !== username) {
    return NextResponse.json({ error: "Forbidden: You do not own this agent" }, { status: 403 });
  }

  const success = await deleteAgent(id);
  if (!success) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Agent deleted" });
}
