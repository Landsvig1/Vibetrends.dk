import { NextResponse } from "next/server";
import { getSkills, getProjects, getAgents } from "@/lib/db";

// Basic MCP-like interface for tools
export async function GET() {
  const tools = [
    {
      name: "search_skills",
      description: "Søg i biblioteket af AI-skills, workflows og scripts.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Søgeterm" },
          category: { type: "string", enum: ["Prompting", "Agents", "Automation", "Fullstack"] }
        }
      }
    },
    {
      name: "search_showcase",
      description: "Udforsk projekter bygget med AI og se deres prompts.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Søgeterm" }
        }
      }
    },
    {
      name: "search_agents",
      description: "Find MCP servere og AI agenter i kartoteket.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Søgeterm" }
        }
      }
    }
  ];

  return NextResponse.json({ tools });
}

export async function POST(request: Request) {
  try {
    const { method, params } = await request.json();

    if (method === "search_skills") {
      const results = await getSkills(params?.query, params?.category);
      return NextResponse.json({ results });
    }

    if (method === "search_showcase") {
      const results = await getProjects(params?.query);
      return NextResponse.json({ results });
    }

    if (method === "search_agents") {
      const results = await getAgents(params?.query);
      return NextResponse.json({ results });
    }

    return NextResponse.json({ error: "Method not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
