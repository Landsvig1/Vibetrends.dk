import { NextResponse } from "next/server";
import { createThread } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { title, author, category, content } = await request.json();

    if (!title || !category || !content) {
      return NextResponse.json(
        { error: "Manglende påkrævede felter (title, category, content)" },
        { status: 400 }
      );
    }

    // Fallback for username if guest
    const finalAuthor = author || `vibecoder_${Math.random().toString(36).substring(2, 7)}`;

    const thread = await createThread(title, finalAuthor, category, content);
    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });
  }
}
