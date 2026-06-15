import { NextResponse } from "next/server";
import { getSkills, getDb } from "@/lib/db";
import { z } from "zod";

const skillSchema = z.object({
  title: z.string().min(1).max(100),
  category: z.enum(["Prompting", "Agents", "Automation", "Fullstack"]),
  description: z.string().min(10).max(1000),
  tags: z.array(z.string()).max(10).optional(),
  githubUrl: z.string().url().max(200).optional().or(z.literal("")),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;

  const skills = await getSkills(search, category);
  return NextResponse.json(skills, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
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
    const result = skillSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { title, category, description, tags, githubUrl } = result.data;

    const db = await getDb();
    const newSkill = {
      id: `s${db.skills.length + 1}`,
      title,
      category,
      vibeCoder: username,
      vibeCoderTitle: "Community Contributor",
      rating: 5.0,
      reviewsCount: 0,
      description,
      tags: tags || [],
      githubUrl: githubUrl || undefined
    };

    db.skills.push(newSkill as any);

    return NextResponse.json(newSkill, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
