import { NextResponse } from "next/server";
import { createThread } from "@/lib/db";
import { z } from "zod";

const threadSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.enum(["General", "Prompts", "Showcase Discussion", "Setup & Config"]),
  content: z.string().min(10).max(5000),
});

export async function POST(request: Request) {
  try {
    const username = request.headers.get("x-username");
    if (!username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = threadSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { title, category, content } = result.data;

    const thread = await createThread(title, username, category, content);
    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
