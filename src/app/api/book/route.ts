import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { email, skillId, message } = await request.json();

    if (!email || !skillId || !message) {
      return NextResponse.json(
        { error: "Required fields: email, skillId, message" },
        { status: 400 }
      );
    }

    const skill = db.skills.find((s) => s.id === skillId);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Log the transaction request
    console.log(`Booking request for ${skill.vibeCoder}: From ${email}, Msg: ${message}`);

    return NextResponse.json({
      success: true,
      message: `Forespørgsel leveret til ${skill.vibeCoder}. Du modtager svar på ${email}.`,
    });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
