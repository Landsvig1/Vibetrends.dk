import { NextResponse } from "next/server";
import { addReply } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { threadId, author, content } = await request.json();

    if (!threadId || !content) {
      return NextResponse.json(
        { error: "Manglende påkrævede felter (threadId, content)" },
        { status: 400 }
      );
    }

    // Fallback for username if guest
    const finalAuthor = author || `vibecoder_${Math.random().toString(36).substring(2, 7)}`;

    const thread = await addReply(threadId, finalAuthor, content);
    if (!thread) {
      return NextResponse.json({ error: "Tråden blev ikke fundet" }, { status: 404 });
    }

    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });
  }
}
